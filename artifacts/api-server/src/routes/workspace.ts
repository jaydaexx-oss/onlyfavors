import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  companionApplications,
  companionProfiles,
  notifications,
  savedCompanions,
  trustedContacts,
} from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getActorId } from "../lib/auth";
import { resolveCompanionProfile } from "../lib/companionIdentity";

const router: IRouter = Router();

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const msg = (s: unknown) => typeof s === "string" && s.includes("does not exist");
  return msg(e.message) || msg((e.cause as { message?: string } | undefined)?.message);
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
  const relation = String(req.body?.relation ?? "Friend").trim().slice(0, 40);
  if (!name || !phone) { res.status(400).json({ error: "Name and phone are required" }); return; }
  try {
    const existing = await db.select().from(trustedContacts).where(eq(trustedContacts.accountId, accountId));
    if (existing.length >= 3) {
      res.status(409).json({ error: "You can add up to three trusted contacts" }); return;
    }
    const [row] = await db.insert(trustedContacts).values({
      accountId,
      name: name.slice(0, 80),
      phone: phone.slice(0, 40),
      relation,
    }).returning();
    res.status(201).json({
      id: row.id,
      name: row.name,
      phone: row.phone ?? "",
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
    if (!rows[0]) { res.json({ status: "none" }); return; }
    const row = rows[0];
    const stage = row.status === "approved" ? 3 : row.status === "rejected" ? 0 : 1;
    res.json({
      id: row.id,
      status: row.status,
      stage,
      city: row.city,
      submittedAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    if (isMissingTableError(err)) { res.json({ status: "none" }); return; }
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

router.get("/companion/profile", async (req, res) => {
  const profile = await resolveCompanionProfile(req);
  if (!profile) { res.status(401).json({ error: "Authentication required" }); return; }
  res.json({
    displayName: profile.displayName || "Companion",
    bio: profile.biography ?? "",
    hourlyRateCents: Math.round((profile.hourlyRate || 0) * 100),
    activities: profile.activities ?? [],
    languages: profile.languages ?? [],
    serviceArea: profile.serviceArea || profile.city,
    availableDays: [],
    availableHoursStart: "10:00",
    availableHoursEnd: "20:00",
    photoUrl: profile.photoUrl,
    paused: profile.paused,
    availableToday: profile.availableToday,
    approved: profile.approved,
    interviewAnswers: profile.interviewAnswers ?? [],
  });
});

router.put("/companion/profile", async (req, res) => {
  const accountId = getActorId(req, "companion");
  if (!accountId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { displayName, bio, hourlyRateCents, activities, languages, serviceArea, interviewAnswers } = req.body ?? {};
  if (!displayName?.trim()) { res.status(400).json({ error: "Display name is required" }); return; }
  if (!bio?.trim()) { res.status(400).json({ error: "Bio is required" }); return; }
  if (typeof hourlyRateCents !== "number" || hourlyRateCents < 2000 || hourlyRateCents > 50000) {
    res.status(400).json({ error: "Hourly rate must be between $20 and $500" }); return;
  }
  if (!Array.isArray(activities) || activities.length === 0) { res.status(400).json({ error: "At least one activity is required" }); return; }
  if (!Array.isArray(languages) || languages.length === 0) { res.status(400).json({ error: "At least one language is required" }); return; }

  const hourlyRate = Math.round(hourlyRateCents / 100);
  try {
    const existing = await db.select().from(companionProfiles).where(eq(companionProfiles.accountId, accountId)).limit(1);
    const payload = {
      displayName: String(displayName).slice(0, 80),
      biography: String(bio).slice(0, 600),
      hourlyRate,
      activities: activities.slice(0, 12).map((a: unknown) => String(a).slice(0, 50)),
      languages: languages.slice(0, 8).map((l: unknown) => String(l).slice(0, 40)),
      serviceArea: String(serviceArea ?? "").slice(0, 100),
      city: String(serviceArea ?? existing[0]?.city ?? "Unknown").slice(0, 80),
      interviewAnswers: Array.isArray(interviewAnswers)
        ? interviewAnswers.slice(0, 3).map((a: unknown) => String(a).slice(0, 400))
        : (existing[0]?.interviewAnswers ?? []),
      updatedAt: new Date(),
    };
    if (existing[0]) {
      const [updated] = await db.update(companionProfiles).set(payload).where(eq(companionProfiles.id, existing[0].id)).returning();
      res.json({
        displayName: updated.displayName,
        bio: updated.biography ?? "",
        hourlyRateCents: updated.hourlyRate * 100,
        activities: updated.activities,
        languages: updated.languages,
        serviceArea: updated.serviceArea,
        photoUrl: updated.photoUrl,
        interviewAnswers: updated.interviewAnswers ?? [],
      });
      return;
    }
    const [created] = await db.insert(companionProfiles).values({
      accountId,
      ...payload,
      approved: false,
      verified: false,
    }).returning();
    res.json({
      displayName: created.displayName,
      bio: created.biography ?? "",
      hourlyRateCents: created.hourlyRate * 100,
      activities: created.activities,
      languages: created.languages,
      serviceArea: created.serviceArea,
      photoUrl: created.photoUrl,
      interviewAnswers: created.interviewAnswers ?? [],
    });
  } catch (err) {
    req.log.error({ err }, "Companion profile save failed");
    res.status(503).json({ error: "Could not save profile" });
  }
});

export default router;
