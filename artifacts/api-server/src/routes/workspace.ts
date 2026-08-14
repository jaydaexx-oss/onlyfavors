import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  accountBlocks,
  accounts,
  availabilityWindows,
  bookings,
  companionApplications,
  companionProfiles,
  notifications,
  savedCompanions,
  serviceAreas,
  sessions,
  trustedContacts,
} from "@workspace/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { clearSessionCookie, getActorId, writeAudit } from "../lib/auth";
import { isCompanionUser, resolveCompanionProfile } from "../lib/companionIdentity";
import {
  editorToWindows,
  mergeWorkspacePrefs,
  parseClock,
  windowsToEditor,
} from "../lib/availability";
import { PILOT_CITY } from "../lib/pilot";
import { normalizeApprovedAreas, SERVICE_RADIUS_KM } from "../lib/nolaAreas";
import { recordBookingEvent } from "../lib/bookingLifecycle";
import { refundOrCancelIntent } from "../lib/stripeMoney";

const router: IRouter = Router();

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const msg = (s: unknown) => typeof s === "string" && s.includes("does not exist");
  return msg(e.message) || msg((e.cause as { message?: string } | undefined)?.message);
}

async function loadAvailability(companionId: string) {
  try {
    const windows = await db
      .select()
      .from(availabilityWindows)
      .where(eq(availabilityWindows.companionId, companionId));
    return windowsToEditor(windows);
  } catch (err) {
    if (isMissingTableError(err)) {
      return { availableDays: [] as string[], availableHoursStart: "10:00", availableHoursEnd: "20:00" };
    }
    throw err;
  }
}

async function persistAvailability(
  companionId: string,
  days: unknown,
  start: unknown,
  end: unknown,
) {
  const rows = editorToWindows(companionId, days, start, end);
  await db.delete(availabilityWindows).where(eq(availabilityWindows.companionId, companionId));
  if (rows.length) await db.insert(availabilityWindows).values(rows);
}

function profilePayload(
  profile: typeof companionProfiles.$inferSelect,
  availability: ReturnType<typeof windowsToEditor>,
  approvedAreas: string[] = [],
) {
  const areas = approvedAreas.length ? approvedAreas : normalizeApprovedAreas([], profile.serviceArea);
  return {
    id: profile.id,
    displayName: profile.displayName || "Companion",
    bio: profile.biography ?? "",
    hourlyRateCents: Math.round((profile.hourlyRate || 0) * 100),
    activities: profile.activities ?? [],
    languages: profile.languages ?? [],
    serviceArea: areas[0] || profile.serviceArea || profile.city,
    approvedAreas: areas,
    availableDays: availability.availableDays,
    availableHoursStart: availability.availableHoursStart,
    availableHoursEnd: availability.availableHoursEnd,
    photoUrl: profile.photoUrl,
    paused: profile.paused,
    availableToday: profile.availableToday,
    approved: profile.approved,
    identityStatus: profile.identityStatus ?? "unsubmitted",
    instantBook: Boolean(profile.instantBook),
    dayRateCents: profile.dayRate != null ? Math.round(profile.dayRate * 100) : null,
    interviewAnswers: profile.interviewAnswers ?? [],
  };
}

async function loadApprovedAreas(companionId: string, fallback = "") {
  try {
    const rows = await db.select().from(serviceAreas).where(eq(serviceAreas.companionId, companionId));
    return normalizeApprovedAreas(rows.map((row) => row.label), fallback);
  } catch (err) {
    if (isMissingTableError(err)) return normalizeApprovedAreas([], fallback);
    throw err;
  }
}

async function persistApprovedAreas(companionId: string, raw: unknown, fallback: string) {
  const labels = normalizeApprovedAreas(raw, fallback);
  try {
    await db.delete(serviceAreas).where(eq(serviceAreas.companionId, companionId));
    if (labels.length) {
      await db.insert(serviceAreas).values(
        labels.map((label) => ({
          companionId,
          label,
          city: PILOT_CITY,
          radiusKm: SERVICE_RADIUS_KM,
        })),
      );
    }
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }
  return labels;
}

router.get("/trust-circle", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db
      .select()
      .from(trustedContacts)
      .where(eq(trustedContacts.accountId, accountId))
      .orderBy(trustedContacts.createdAt);
    res.json(rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone ?? "",
      email: row.email ?? "",
      relation: row.relation ?? "Friend",
    })));
  } catch (err) {
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Trust circle list failed");
    res.status(503).json({ error: "Could not load Trust Circle" });
  }
});

router.post("/trust-circle", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  const name = String(req.body?.name ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const relation = String(req.body?.relation ?? "Friend").trim().slice(0, 40);
  if (!name || (!phone && !email)) { res.status(400).json({ error: "Name and a phone or email are required" }); return; }
  try {
    const existing = await db.select().from(trustedContacts).where(eq(trustedContacts.accountId, accountId));
    if (existing.length >= 3) {
      res.status(409).json({ error: "You can add up to three trusted contacts" }); return;
    }
    const [row] = await db.insert(trustedContacts).values({
      accountId,
      name: name.slice(0, 80),
      phone: phone.slice(0, 40) || null,
      email: email.slice(0, 120) || null,
      relation,
    }).returning();
    res.status(201).json({
      id: row.id,
      name: row.name,
      phone: row.phone ?? "",
      email: row.email ?? "",
      relation: row.relation ?? "Friend",
    });
  } catch (err) {
    req.log.error({ err }, "Trust circle add failed");
    res.status(503).json({ error: "Could not save contact" });
  }
});

router.delete("/trust-circle/:id", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [row] = await db
      .delete(trustedContacts)
      .where(and(eq(trustedContacts.id, req.params.id), eq(trustedContacts.accountId, accountId)))
      .returning();
    if (!row) { res.status(404).json({ error: "Contact not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Trust circle remove failed");
    res.status(503).json({ error: "Could not remove contact" });
  }
});

router.get("/saved", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db
      .select()
      .from(savedCompanions)
      .where(eq(savedCompanions.accountId, accountId));
    res.json(rows.map((row) => row.companionId));
  } catch (err) {
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Saved companions failed");
    res.status(503).json({ error: "Could not load saved companions" });
  }
});

router.post("/saved/:companionId", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await db.insert(savedCompanions).values({
      accountId,
      companionId: req.params.companionId,
    }).onConflictDoNothing();
    res.json({ saved: true });
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json({ saved: true }); return;
    }
    req.log.error({ err }, "Save companion failed");
    res.status(503).json({ error: "Could not save companion" });
  }
});

router.delete("/saved/:companionId", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await db.delete(savedCompanions).where(
      and(
        eq(savedCompanions.accountId, accountId),
        eq(savedCompanions.companionId, req.params.companionId),
      ),
    );
    res.json({ saved: false });
  } catch (err) {
    req.log.error({ err }, "Unsave companion failed");
    res.status(503).json({ error: "Could not update saved companions" });
  }
});

router.get("/companion/applications/me", async (req, res) => {
  const accountId = getActorId(req, "companion");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const email = req.user?.email;
    const rows = await db
      .select()
      .from(companionApplications)
      .where(email ? eq(companionApplications.email, email) : eq(companionApplications.accountId, accountId))
      .orderBy(desc(companionApplications.createdAt))
      .limit(1);
    if (!rows[0]) { res.json({ status: "none", stage: -1 }); return; }
    const row = rows[0];
    const submitted = row.status !== "draft";
    const stage = row.status === "approved" ? 2 : row.status === "pending" ? 1 : 0;
    res.json({
      id: row.id,
      status: row.status,
      submitted,
      stage,
      city: row.city,
      submittedAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    if (isMissingTableError(err)) { res.json({ status: "none", stage: -1 }); return; }
    req.log.error({ err }, "Application status failed");
    res.status(503).json({ error: "Could not load application status" });
  }
});

router.get("/notifications", async (req, res) => {
  const accountId = getActorId(req, req.query.role === "companion" ? "companion" : "customer");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  const audience = req.query.role === "companion" ? "companion" : "customer";
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.accountId, accountId), eq(notifications.audience, audience)))
      .orderBy(desc(notifications.createdAt))
      .limit(30);
    res.json(rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      href: row.href,
      createdAt: row.createdAt.toISOString(),
      read: Boolean(row.readAt),
      audience: row.audience,
    })));
  } catch (err) {
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Notifications failed");
    res.status(503).json({ error: "Could not load notifications" });
  }
});

router.post("/notifications/read-all", async (req, res) => {
  const accountId = getActorId(req, req.body?.role === "companion" ? "companion" : "customer");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.accountId, accountId));
    res.json({ ok: true });
  } catch (err) {
    if (isMissingTableError(err)) { res.json({ ok: true }); return; }
    res.status(503).json({ error: "Could not update notifications" });
  }
});

router.post("/notifications/:id/read", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.accountId, accountId)));
    res.json({ ok: true });
  } catch (err) {
    if (isMissingTableError(err)) { res.json({ ok: true }); return; }
    res.status(503).json({ error: "Could not update notification" });
  }
});

router.get("/account/settings", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId || !req.user) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    const prefs = row?.prefs ?? {};
    res.json({
      displayName: row?.displayName ?? req.user.displayName ?? "",
      email: req.user.email,
      emailBookingUpdates: prefs.emailBookingUpdates !== false,
      emailNewsletter: Boolean(prefs.emailNewsletter),
      showSavedCount: prefs.showSavedCount !== false,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      res.json({
        displayName: req.user.displayName ?? "",
        email: req.user.email,
        emailBookingUpdates: true,
        emailNewsletter: false,
        showSavedCount: true,
      });
      return;
    }
    req.log.error({ err }, "Account settings load failed");
    res.status(503).json({ error: "Could not load settings" });
  }
});

router.put("/account/settings", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId || !req.user) { res.status(401).json({ error: "Authentication required" }); return; }
  const displayName = String(req.body?.displayName ?? "").trim().slice(0, 40);
  const prefs = {
    emailBookingUpdates: req.body?.emailBookingUpdates !== false,
    emailNewsletter: Boolean(req.body?.emailNewsletter),
    showSavedCount: req.body?.showSavedCount !== false,
  };
  try {
    const [row] = await db.update(accounts).set({
      displayName: displayName || null,
      prefs,
      updatedAt: new Date(),
    }).where(eq(accounts.id, accountId)).returning();
    res.json({
      displayName: row?.displayName ?? displayName,
      email: req.user.email,
      ...prefs,
    });
  } catch (err) {
    req.log.error({ err }, "Account settings save failed");
    res.status(503).json({ error: "Could not save settings" });
  }
});

router.get("/companion/workspace-prefs", async (req, res) => {
  const profile = await resolveCompanionProfile(req);
  if (!profile) { res.status(401).json({ error: "Authentication required" }); return; }
  res.json(mergeWorkspacePrefs(profile.workspacePrefs));
});

router.put("/companion/workspace-prefs", async (req, res) => {
  const profile = await resolveCompanionProfile(req);
  if (!profile) { res.status(401).json({ error: "Authentication required" }); return; }
  const next = mergeWorkspacePrefs({
    quietHours: {
      enabled: Boolean(req.body?.quietHours?.enabled),
      start: parseClock(req.body?.quietHours?.start, "22:00"),
      end: parseClock(req.body?.quietHours?.end, "08:00"),
    },
    away: {
      enabled: Boolean(req.body?.away?.enabled),
      returnDate: String(req.body?.away?.returnDate ?? "").slice(0, 20),
      note: String(req.body?.away?.note ?? "").slice(0, 100),
      pausedByAway: Boolean(req.body?.away?.pausedByAway),
    },
  });

  let paused = profile.paused;
  if (next.away.enabled && !profile.paused) {
    paused = true;
    next.away.pausedByAway = true;
  } else if (!next.away.enabled && profile.workspacePrefs?.away?.pausedByAway) {
    paused = false;
    next.away.pausedByAway = false;
  } else if (!next.away.enabled) {
    next.away.pausedByAway = false;
  }

  try {
    await db.update(companionProfiles).set({
      workspacePrefs: next,
      paused,
      updatedAt: new Date(),
    }).where(eq(companionProfiles.id, profile.id));
    res.json(next);
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json(next); return;
    }
    req.log.error({ err }, "Workspace prefs save failed");
    res.status(503).json({ error: "Could not save workspace preferences" });
  }
});

router.get("/companion/profile", async (req, res) => {
  if (!req.user?.id || req.user.suspended) {
    res.status(401).json({ error: "Authentication required" }); return;
  }
  if (!isCompanionUser(req)) {
    res.status(403).json({ error: "Companion role required" }); return;
  }
  const profile = await resolveCompanionProfile(req);
  if (!profile) {
    res.json({
      id: null,
      displayName: req.user.displayName ?? "",
      bio: "",
      hourlyRateCents: 0,
      activities: [],
      languages: [],
      serviceArea: "",
      approvedAreas: [],
      availableDays: [],
      availableHoursStart: "10:00",
      availableHoursEnd: "20:00",
      photoUrl: null,
      paused: false,
      availableToday: false,
      approved: false,
      identityStatus: "unsubmitted",
      instantBook: false,
      dayRateCents: null,
      interviewAnswers: [],
    });
    return;
  }
  try {
    const availability = await loadAvailability(profile.id);
    const areas = await loadApprovedAreas(profile.id, profile.serviceArea);
    res.json(profilePayload(profile, availability, areas));
  } catch (err) {
    req.log.error({ err }, "Companion profile load failed");
    res.status(503).json({ error: "Could not load profile" });
  }
});

router.put("/companion/profile", async (req, res) => {
  if (!req.user?.id || req.user.suspended) {
    res.status(401).json({ error: "Authentication required" }); return;
  }
  if (!isCompanionUser(req)) {
    res.status(403).json({ error: "Companion role required" }); return;
  }
  const accountId = req.user.id;
  const {
    displayName, bio, hourlyRateCents, activities, languages, serviceArea, approvedAreas, interviewAnswers,
    availableDays, availableHoursStart, availableHoursEnd, instantBook, dayRateCents,
  } = req.body ?? {};
  if (!displayName?.trim()) { res.status(400).json({ error: "Display name is required" }); return; }
  if (!bio?.trim()) { res.status(400).json({ error: "Bio is required" }); return; }
  if (typeof hourlyRateCents !== "number" || hourlyRateCents < 2000 || hourlyRateCents > 50000) {
    res.status(400).json({ error: "Hourly rate must be between $20 and $500" }); return;
  }
  if (!Array.isArray(activities) || activities.length === 0) { res.status(400).json({ error: "At least one activity is required" }); return; }
  if (!Array.isArray(languages) || languages.length === 0) { res.status(400).json({ error: "At least one language is required" }); return; }

  const hourlyRate = Math.round(hourlyRateCents / 100);
  const areas = normalizeApprovedAreas(approvedAreas, String(serviceArea ?? ""));
  const dayRate =
    dayRateCents == null || dayRateCents === ""
      ? null
      : Math.round(Number(dayRateCents) / 100);
  if (dayRate != null && (!Number.isFinite(dayRate) || dayRate < 20 || dayRate > 4000)) {
    res.status(400).json({ error: "Full-day rate must be between $20 and $4000" }); return;
  }
  try {
    const existing = await db.select().from(companionProfiles).where(eq(companionProfiles.accountId, accountId)).limit(1);
    const payload = {
      displayName: String(displayName).slice(0, 80),
      biography: String(bio).slice(0, 600),
      hourlyRate,
      activities: activities.slice(0, 12).map((a: unknown) => String(a).slice(0, 50)),
      languages: languages.slice(0, 8).map((l: unknown) => String(l).slice(0, 40)),
      serviceArea: areas[0] ?? PILOT_CITY,
      city: PILOT_CITY,
      instantBook: Boolean(instantBook),
      dayRate,
      interviewAnswers: Array.isArray(interviewAnswers)
        ? interviewAnswers.slice(0, 3).map((a: unknown) => String(a).slice(0, 400))
        : (existing[0]?.interviewAnswers ?? []),
      updatedAt: new Date(),
    };
    const saved = existing[0]
      ? (await db.update(companionProfiles).set(payload).where(eq(companionProfiles.id, existing[0].id)).returning())[0]
      : (await db.insert(companionProfiles).values({
          accountId,
          ...payload,
          approved: false,
          verified: false,
        }).returning())[0];

    if (availableDays !== undefined) {
      try {
        await persistAvailability(saved.id, availableDays, availableHoursStart, availableHoursEnd);
      } catch (err) {
        if (!isMissingTableError(err)) throw err;
      }
    }
    const storedAreas = await persistApprovedAreas(saved.id, areas, saved.serviceArea);
    const availability = await loadAvailability(saved.id);
    res.json(profilePayload(saved, availability, storedAreas));
  } catch (err) {
    req.log.error({ err }, "Companion profile save failed");
    res.status(503).json({ error: "Could not save profile" });
  }
});

router.post("/account/delete", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId || !req.user) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account) { res.status(404).json({ error: "Account not found" }); return; }
    if (account.deletedAt) {
      clearSessionCookie(res);
      res.json({ deleted: true });
      return;
    }
    const profiles = await db.select().from(companionProfiles).where(eq(companionProfiles.accountId, accountId));
    const customerRows = await db.select().from(bookings).where(eq(bookings.customerId, accountId));
    const companionRows = profiles.length
      ? await db.select().from(bookings).where(inArray(bookings.companionId, profiles.map((p) => p.id)))
      : [];
    const seen = new Set<string>();
    const open = [...customerRows, ...companionRows].filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return !["completed", "cancelled"].includes(row.status);
    });
    for (const booking of open) {
      try {
        await refundOrCancelIntent(booking.depositPaymentIntentId);
        await refundOrCancelIntent(booking.fullPaymentIntentId);
      } catch (payErr) {
        req.log.error({ payErr, bookingId: booking.id }, "Delete refund failed");
        res.status(503).json({ error: "Could not refund an open booking. Email hello@onlyfavors.com." }); return;
      }
      await db.update(bookings).set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(bookings.id, booking.id));
      await recordBookingEvent({
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: "cancelled",
        actorId: accountId,
        note: "account_deleted",
      });
    }

    await db.update(companionProfiles).set({
      paused: true,
      approved: false,
      updatedAt: new Date(),
    }).where(eq(companionProfiles.accountId, accountId));

    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.accountId, accountId));
    await db.update(accounts).set({
      email: `deleted+${accountId}@invalid.onlyfavors`,
      displayName: "Deleted account",
      deletedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(accounts.id, accountId));

    await writeAudit({
      actorId: accountId,
      action: "account.delete",
      subjectType: "account",
      subjectId: accountId,
    });
    clearSessionCookie(res);
    res.json({ deleted: true });
  } catch (err) {
    req.log.error({ err }, "Account delete failed");
    res.status(503).json({ error: "Could not delete this account. Email hello@onlyfavors.com." });
  }
});

router.get("/blocks", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db.select().from(accountBlocks).where(eq(accountBlocks.blockerId, accountId));
    const names = new Map<string, string>();
    if (rows.length) {
      const people = await db.select({ id: accounts.id, displayName: accounts.displayName }).from(accounts)
        .where(inArray(accounts.id, rows.map((r) => r.blockedId)));
      for (const person of people) names.set(person.id, person.displayName || "Account");
    }
    res.json(rows.map((row) => ({
      id: row.id,
      blockedId: row.blockedId,
      displayName: names.get(row.blockedId) ?? "Account",
      createdAt: row.createdAt.toISOString(),
    })));
  } catch (err) {
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Block list failed");
    res.status(503).json({ error: "Could not load blocks" });
  }
});

router.post("/blocks", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  let blockedId = typeof req.body?.accountId === "string" ? req.body.accountId : "";
  const companionId = typeof req.body?.companionId === "string" ? req.body.companionId : "";
  if (!blockedId && companionId) {
    const [profile] = await db.select().from(companionProfiles).where(eq(companionProfiles.id, companionId)).limit(1);
    blockedId = profile?.accountId ?? "";
  }
  if (!blockedId || blockedId === accountId) {
    res.status(400).json({ error: "Choose someone to block." }); return;
  }
  try {
    const [row] = await db.insert(accountBlocks).values({ blockerId: accountId, blockedId }).returning();
    res.status(201).json({ id: row.id, blockedId: row.blockedId });
  } catch (err) {
    if (String((err as { message?: string })?.message ?? "").includes("duplicate") || (err as { code?: string })?.code === "23505") {
      res.json({ blockedId, alreadyBlocked: true }); return;
    }
    req.log.error({ err }, "Block failed");
    res.status(503).json({ error: "Could not block this account" });
  }
});

router.delete("/blocks/:blockedId", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await db.delete(accountBlocks).where(and(
      eq(accountBlocks.blockerId, accountId),
      eq(accountBlocks.blockedId, req.params.blockedId),
    ));
    res.json({ unblocked: true });
  } catch (err) {
    req.log.error({ err }, "Unblock failed");
    res.status(503).json({ error: "Could not unblock" });
  }
});

router.get("/account/verification", async (req, res) => {
  if (!req.user?.id) { res.status(401).json({ error: "Authentication required" }); return; }
  const accountId = req.user.id;
  try {
    const [app] = await db.select().from(companionApplications)
      .where(eq(companionApplications.accountId, accountId))
      .orderBy(desc(companionApplications.createdAt))
      .limit(1);
    const profile = await db.select().from(companionProfiles).where(eq(companionProfiles.accountId, accountId)).limit(1);
    const listing = profile[0];
    const applicationStatus = app?.status ?? "none";
    res.json({
      status: req.user.status,
      emailVerified: true,
      ageConfirmed: req.user.ageConfirmed,
      canSave: req.user.status === "active" || req.user.status === "deactivated",
      canRequest: req.user.status === "active" && req.user.ageConfirmed,
      canBook: req.user.status === "active" && req.user.ageConfirmed,
      companion: listing || app ? {
        applicationStatus,
        identityStatus: listing?.identityStatus ?? "unsubmitted",
        approved: Boolean(listing?.approved),
        payoutReady: Boolean(listing?.stripeAccountId),
        canPublish: Boolean(listing?.approved),
        canEarn: Boolean(listing?.approved && listing?.stripeAccountId),
      } : null,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      res.json({
        status: req.user.status,
        emailVerified: true,
        ageConfirmed: req.user.ageConfirmed,
        canSave: true,
        canRequest: req.user.ageConfirmed,
        canBook: req.user.ageConfirmed,
        companion: null,
      });
      return;
    }
    req.log.error({ err }, "Verification status failed");
    res.status(503).json({ error: "Could not load verification status" });
  }
});

router.post("/account/deactivate", async (req, res) => {
  const accountId = getActorId(req, "customer");
  if (!accountId || !req.user) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await db.update(accounts).set({
      deactivatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(accounts.id, accountId));
    await db.update(companionProfiles).set({ paused: true, updatedAt: new Date() }).where(eq(companionProfiles.accountId, accountId));
    await writeAudit({
      actorId: accountId,
      action: "account.deactivate",
      subjectType: "account",
      subjectId: accountId,
    });
    res.json({ status: "deactivated" });
  } catch (err) {
    req.log.error({ err }, "Deactivate failed");
    res.status(503).json({ error: "Could not deactivate this account" });
  }
});

router.post("/account/reactivate", async (req, res) => {
  if (!req.user?.id) { res.status(401).json({ error: "Authentication required" }); return; }
  if (req.user.banned || req.user.suspended) {
    res.status(403).json({ error: "This account cannot be reactivated from settings." }); return;
  }
  try {
    await db.update(accounts).set({
      deactivatedAt: null,
      updatedAt: new Date(),
    }).where(eq(accounts.id, req.user.id));
    await writeAudit({
      actorId: req.user.id,
      action: "account.reactivate",
      subjectType: "account",
      subjectId: req.user.id,
    });
    res.json({ status: "active" });
  } catch (err) {
    req.log.error({ err }, "Reactivate failed");
    res.status(503).json({ error: "Could not reactivate this account" });
  }
});

export default router;
