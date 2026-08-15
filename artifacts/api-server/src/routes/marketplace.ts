import { Router, type IRouter, type Request, type Response } from "express";
import {
  AuthorizeDepositParams,
  AuthorizeFullPaymentParams,
  CreateBookingIntentBody,
  CreateFavorRequestBody,
  GetBookingQuoteQueryParams,
  GetCompanionParams,
  GetSafetyResourcesResponse,
  ListCompanionsQueryParams,
  ListSafeSpotsQueryParams,
} from "@workspace/api-zod";
import { db, bookings, favorRequests, messages } from "@workspace/db";
import {
  accountBlocks,
  accountRoles,
  accounts,
  adminAuditLog,
  checkIns,
  companionApplications,
  companionProfiles,
  exactLocations,
  incidentReports,
  notifications,
  platformSettings,
  reviews as reviewRows,
  safespotApplications,
  safespots,
  savedCompanions,
  availabilityWindows,
  serviceAreas,
  locationShareLinks,
} from "@workspace/db/schema";
import { desc, eq, and, inArray, or, sql } from "drizzle-orm";
import {
  getApprovedCompanion,
  getApprovedCompanions,
  getPublicCompanion,
  getSafeSpot,
  getSafeSpots,
} from "../lib/supabase";
import { priceForBooking } from "../lib/pricing";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { getActorId, requireAdmin, requireAuth, revokeAllSessions, writeAudit } from "../lib/auth";
import { assertCanTransact } from "../lib/accountState";
import { resolveCompanionId, resolveCompanionProfile, isCompanionUser } from "../lib/companionIdentity";
import { decryptExactLocation, encryptExactLocation, locationEncryptionReady } from "../lib/locationCrypto";
import { mergeWorkspacePrefs, windowsMatchWhen, windowsHint, windowsToPublic } from "../lib/availability";
import { neighborhoodCenter } from "../lib/nolaAreas";
import { assertDurationHours, bookingRange, chicagoDateTime, isPilotCity, PILOT_CITY, PILOT_TZ } from "../lib/pilot";
import { companionHasOverlap, expireUnpaidHolds, HOLD_TTL_MS, isExclusionViolation, recordBookingEvent, assertBookingTransition } from "../lib/bookingLifecycle";
import { captureIntentIfHeld, customerCancelPlan, refundOrCancelIntent, transferCompanionPayout } from "../lib/stripeMoney";
import { clientKey, rateLimit } from "../lib/rateLimit";
import {
  hashShareToken,
  LOCATION_RETENTION_MS,
  mintShareToken,
  notifyTrustCircle,
  purgeExpiredLocations,
  SHARING_STATUSES,
  stopOrdinarySharing,
  venueRevealed,
} from "../lib/locationLadder";
import { loadBoundaryReceipt, previewBoundaryReceipt, signBoundaryReceipt } from "../lib/boundaryReceipt";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when a DB error is caused by a missing table (pre-migration). */
function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const msg = (s: unknown) => typeof s === "string" && s.includes("does not exist");
  // Drizzle wraps the postgres error — check message at every level of the chain
  if (msg(e.message)) return true;
  if (msg((e.cause as any)?.message)) return true;
  if ((e.cause as any)?.code === "42P01") return true; // undefined_table
  return false;
}

function publicFirstName(name: string | null | undefined): string {
  const first = String(name ?? "").trim().split(/\s+/)[0];
  return first || "Companion";
}

/** In-app notices stay privacy-safe. Detail lives behind a signed-in booking screen. */
async function notifyAccount(
  accountId: string | null | undefined,
  payload: { kind: string; href: string; audience: "customer" | "companion"; title?: string; body?: string },
) {
  if (!accountId) return;
  try {
    await db.insert(notifications).values({
      accountId,
      kind: payload.kind,
      title: "You have a booking update",
      body: "Open OnlyFavors to see it. This notice never includes an address, phone number, or live pin.",
      href: payload.href,
      audience: payload.audience,
    });
  } catch {
    /* notifications table may not exist yet */
  }
}

// ---------------------------------------------------------------------------
// In-memory Stripe Connect account store (dev-only)
// Replace with Supabase companion_profiles.stripe_account_id once Task #1 lands
// ---------------------------------------------------------------------------
const devCompanionStripeAccounts = new Map<string, string>(); // companionId → stripeAccountId

// ---------------------------------------------------------------------------
// Discovery — public, privacy-safe
// ---------------------------------------------------------------------------

router.get("/companions", async (req, res) => {
  const limited = rateLimit(clientKey(req.ip, "explore"), 80, 15 * 60_000);
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfterSec));
    res.status(429).json({ error: "Too many directory requests. Try again shortly." });
    return;
  }
  const query = ListCompanionsQueryParams.parse(req.query);
  const when = typeof req.query.when === "string" ? req.query.when : undefined;
  const areaRaw = typeof req.query.area === "string" ? req.query.area.trim() : "";
  const place = (areaRaw || query.city || "").trim();
  const placeIsPilot = !place || isPilotCity(place);
  try {
    const rows = await getApprovedCompanions();
    const ids = rows.map((row) => row.id);
    const windowsByCompanion = new Map<string, Array<{ weekday: number; startTime: string; endTime: string }>>();
    const areasByCompanion = new Map<string, string[]>();
    if (ids.length) {
      try {
        const windows = await db.select().from(availabilityWindows).where(inArray(availabilityWindows.companionId, ids));
        for (const w of windows) {
          const list = windowsByCompanion.get(w.companionId) ?? [];
          list.push({ weekday: w.weekday, startTime: w.startTime, endTime: w.endTime });
          windowsByCompanion.set(w.companionId, list);
        }
      } catch (err) {
        if (!isMissingTableError(err)) throw err;
      }
      try {
        const areas = await db.select().from(serviceAreas).where(inArray(serviceAreas.companionId, ids));
        for (const area of areas) {
          const list = areasByCompanion.get(area.companionId) ?? [];
          if (!list.includes(area.label)) list.push(area.label);
          areasByCompanion.set(area.companionId, list);
        }
      } catch (err) {
        if (!isMissingTableError(err)) throw err;
      }
    }
    const companions = rows
      .filter((row) => {
        if (!isPilotCity(row.city) && !isPilotCity(row.service_area)) return false;
        const labels = areasByCompanion.get(row.id) ?? [];
        if (!placeIsPilot) {
          const hay = `${row.service_area} ${row.city} ${labels.join(" ")}`.toLowerCase();
          if (!hay.includes(place.toLowerCase())) return false;
        }
        if (
          query.activity &&
          !row.activities.some((a) =>
            a.toLowerCase().includes(query.activity!.toLowerCase()),
          )
        )
          return false;
        if (query.language && !row.languages.includes(query.language))
          return false;
        if (query.maxRate !== undefined && row.hourly_rate > query.maxRate)
          return false;
        if (
          query.instantBook !== undefined &&
          row.instant_book !== query.instantBook
        )
          return false;
        const windows = windowsByCompanion.get(row.id) ?? [];
        if (when && !windowsMatchWhen(windows, when)) return false;
        return true;
      })
      .map((row) =>
        mapCompanionRow(
          row,
          windowsHint(windowsByCompanion.get(row.id) ?? []),
          areasByCompanion.get(row.id) ?? [],
        ),
      );
    req.log.info({ count: companions.length }, "Listed approved companions");
    res.json(companions);
  } catch (err) {
    if (isMissingTableError(err) || process.env.NODE_ENV === "development") {
      req.log.warn({ err }, "Companion directory unavailable — returning empty list");
      res.json([]);
      return;
    }
    req.log.error({ err }, "Unable to read approved companions");
    res.status(503).json({ error: "Companion directory is temporarily unavailable" });
  }
});

// In-memory fallbacks used only when the companion_profiles table is missing.
const pausedRequestsSet = new Set<string>();
const availableTodaySet = new Set<string>();

router.get("/companion/requests/paused", async (req, res) => {
  const profile = await resolveCompanionProfile(req);
  if (!profile) { res.status(401).json({ error: "Authentication required" }); return; }
  res.json({ paused: Boolean(profile.paused) || pausedRequestsSet.has(profile.id) });
});

async function setPaused(req: Request, res: Response, paused: boolean) {
  const profile = await resolveCompanionProfile(req);
  if (!profile) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await db.update(companionProfiles).set({ paused, updatedAt: new Date() }).where(eq(companionProfiles.id, profile.id));
  } catch (err) {
    if (!isMissingTableError(err) && process.env.NODE_ENV !== "development") {
      req.log.error({ err }, "Pause update failed");
      res.status(503).json({ error: "Could not update pause state" }); return;
    }
    if (paused) pausedRequestsSet.add(profile.id); else pausedRequestsSet.delete(profile.id);
  }
  res.json({ paused });
}

router.post("/companion/requests/pause", async (req, res) => {
  const paused = req.body?.paused === undefined ? true : Boolean(req.body.paused);
  await setPaused(req, res, paused);
});

router.post("/companion/requests/unpause", async (req, res) => {
  await setPaused(req, res, false);
});

router.get("/companion/availability/today", async (req, res) => {
  const profile = await resolveCompanionProfile(req);
  if (!profile) { res.status(401).json({ error: "Authentication required" }); return; }
  res.json({ available: profile.availableToday || availableTodaySet.has(profile.id) });
});

router.post("/companion/availability/today", async (req, res) => {
  const profile = await resolveCompanionProfile(req);
  if (!profile) { res.status(401).json({ error: "Authentication required" }); return; }
  const available = Boolean(req.body?.available);
  if (available && !profile.approved) {
    res.status(403).json({ error: "Only an approved companion can publish availability." }); return;
  }
  try {
    await db.update(companionProfiles).set({ availableToday: available, updatedAt: new Date() }).where(eq(companionProfiles.id, profile.id));
  } catch (err) {
    if (!isMissingTableError(err) && process.env.NODE_ENV !== "development") {
      req.log.error({ err }, "Availability update failed");
      res.status(503).json({ error: "Could not update availability" }); return;
    }
    if (available) availableTodaySet.add(profile.id); else availableTodaySet.delete(profile.id);
  }
  res.json({ available });
});

/** In-memory bookings used only when the bookings table is missing. Starts empty. */
export const DEV_BOOKING_FIXTURES: Record<string, any> = {};

router.get("/companions/:id", async (req, res) => {
  const limited = rateLimit(clientKey(req.ip, "profile"), 60, 15 * 60_000);
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfterSec));
    res.status(429).json({ error: "Too many profile views. Try again shortly." });
    return;
  }
  const { id } = GetCompanionParams.parse(req.params);
  try {
    const [row] = await getPublicCompanion(id);
    if (!row) {
      res.status(404).json({ error: "Companion not found" });
      return;
    }
    const extras = await publicCompanionExtras(id);
    const mapped = mapCompanionRow(row, extras.availabilityHint, extras.approvedAreas);
    res.json({ ...mapped, ...extras, approvedAreas: mapped.approvedAreas, serviceArea: mapped.serviceArea });
  } catch (err) {
    req.log.error({ err }, "Unable to read companion profile");
    res.status(503).json({ error: "Companion profile is temporarily unavailable" });
  }
});

// ---------------------------------------------------------------------------
// Pricing quote — public, server-calculated, never trusted from browser
// ---------------------------------------------------------------------------

router.get("/bookings/quote", async (req, res) => {
  const { companionId, durationHours } =
    GetBookingQuoteQueryParams.parse(req.query);
  try {
    const hours = assertDurationHours(durationHours);
    const [row] = await getApprovedCompanion(companionId);
    if (!row) {
      res.status(404).json({ error: "Companion not found" });
      return;
    }
    const quote = priceForBooking(row.hourly_rate, hours, companionId, row.day_rate);
    res.json(quote);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Duration")) {
      res.status(400).json({ error: err.message }); return;
    }
    req.log.error({ err }, "Unable to calculate price quote");
    res.status(503).json({ error: "Pricing is temporarily unavailable" });
  }
});

// ---------------------------------------------------------------------------
// Bookings — authentication required (fail closed until auth is live)
// ---------------------------------------------------------------------------

router.post("/bookings", async (req, res) => {
  const body = CreateBookingIntentBody.parse(req.body);

  const customerId = getActorId(req, "customer");
  if (!customerId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!assertCanTransact(req, res)) return;
  const limited = rateLimit(clientKey(req.ip, `book:${customerId}`), 8, 15 * 60_000);
  if (!limited.ok) {
    res.status(429).json({ error: "Too many booking attempts. Try again shortly." }); return;
  }

  try {
    let hours: number;
    try { hours = assertDurationHours(body.durationHours); }
    catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Invalid duration" }); return; }

    const [row] = await getApprovedCompanion(body.companionId);
    if (!row) {
      res.status(404).json({ error: "Companion not found" });
      return;
    }
    if (!isPilotCity(row.city) && !isPilotCity(row.service_area)) {
      res.status(409).json({ error: "This companion is outside the New Orleans pilot." }); return;
    }

    const [profile] = await db.select().from(companionProfiles).where(eq(companionProfiles.id, body.companionId)).limit(1);
    if (profile) {
      const blocked = await db.select().from(accountBlocks).where(or(
        and(eq(accountBlocks.blockerId, customerId), eq(accountBlocks.blockedId, profile.accountId)),
        and(eq(accountBlocks.blockerId, profile.accountId), eq(accountBlocks.blockedId, customerId)),
      )).limit(1);
      if (blocked[0]) {
        res.status(403).json({ error: "This booking cannot be created." }); return;
      }
    }

    const dateStr =
      body.date instanceof Date
        ? body.date.toISOString().split("T")[0]
        : String(body.date);
    const startsAt = chicagoDateTime(dateStr, body.startTime);
    if (startsAt.getTime() < Date.now() - 60_000) {
      res.status(400).json({ error: "Choose a future date and time in New Orleans time." }); return;
    }

    await expireUnpaidHolds();
    const overlap = await companionHasOverlap({
      companionId: body.companionId,
      date: dateStr,
      startTime: body.startTime,
      durationHours: hours,
      startsAt,
    });
    if (overlap) {
      res.status(409).json({ error: "That time overlaps another hold or confirmed booking." }); return;
    }

    const price = priceForBooking(row.hourly_rate, hours, body.companionId, row.day_rate);
    const { end: endsAt } = bookingRange(dateStr, body.startTime, hours, startsAt);

    const [booking] = await db
      .insert(bookings)
      .values({
        customerId,
        companionId: body.companionId,
        activity: body.activity,
        date: dateStr,
        startTime: body.startTime,
        durationHours: String(hours),
        timezone: PILOT_TZ,
        startsAt,
        endsAt,
        holdExpiresAt: new Date(Date.now() + HOLD_TTL_MS),
        safeSpotId: body.safeSpotId,
        status: "requested",
        subtotalCents: price.subtotalCents,
        customerFeeCents: price.customerFeeCents,
        totalCents: price.totalCents,
        companionPayoutCents: price.companionPayoutCents,
        platformRevenueCents: price.platformRevenueCents,
        depositCents: price.depositCents,
      })
      .returning();

    await recordBookingEvent({ bookingId: booking.id, toStatus: "requested", actorId: customerId, note: "created" });

    req.log.info(
      { bookingId: booking.id, totalCents: booking.totalCents },
      "Booking intent created",
    );

    try {
      await notifyAccount(profile?.accountId, {
        kind: "booking_request",
        title: "New booking request",
        body: `${body.activity} on ${dateStr}. Review and respond from your inbox.`,
        href: "/dashboard/companion",
        audience: "companion",
      });
    } catch { /* companion notify is best-effort */ }

    res.status(201).json(formatBooking(booking));
  } catch (err) {
    if (isExclusionViolation(err)) {
      res.status(409).json({ error: "That time overlaps another hold or confirmed booking." });
      return;
    }
    req.log.error({ err }, "Unable to create booking intent");
    res.status(500).json({ error: "Unable to create booking" });
  }
});

router.get("/bookings", async (req, res) => {
  const customerId =
    getActorId(req, "customer");
  if (!customerId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.customerId, customerId));
    res.json(await withReviewedFlag(rows.map(formatBookingFull)));
  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      res.json(Object.values(DEV_BOOKING_FIXTURES).filter((b: any) => b.customerId === customerId)); return;
    }
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Unable to list bookings");
    res.status(503).json({ error: "Bookings temporarily unavailable" });
  }
});

router.get("/bookings/:id", async (req, res) => {
  const { id } = req.params;
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== customerId && booking.companionId !== companionId)) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    const [payload] = await withReviewedFlag([formatBookingFull(booking)]);
    const boundaryReceipt = await loadBoundaryReceipt(booking.id);
    res.json({ ...payload, boundaryReceipt });
  } catch (err: unknown) {
    if (process.env.NODE_ENV === "development") {
      const fixture = DEV_BOOKING_FIXTURES[id];
      if (fixture) { res.json(fixture); return; }
    }
    if (isMissingTableError(err)) { res.status(404).json({ error: "Booking not found" }); return; }
    req.log.error({ err }, "Unable to load booking");
    res.status(503).json({ error: "Booking temporarily unavailable" });
  }
});

router.get("/bookings/:id/boundary-receipt", async (req, res) => {
  const { id } = req.params;
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) {
    res.status(401).json({ error: "Authentication required" }); return;
  }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== customerId && booking.companionId !== companionId)) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    const view = await previewBoundaryReceipt(id);
    if (!view) { res.status(404).json({ error: "Booking not found" }); return; }
    res.json(view);
  } catch (err) {
    if (isMissingTableError(err)) {
      res.status(503).json({ error: "Boundary Receipts are not available yet. Apply migration 0009." }); return;
    }
    req.log.error({ err }, "Boundary receipt preview failed");
    res.status(503).json({ error: "Could not load the Boundary Receipt" });
  }
});

router.post("/bookings/:id/boundary-receipt", async (req, res) => {
  const { id } = req.params;
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) {
    res.status(401).json({ error: "Authentication required" }); return;
  }
  if (req.body?.agreed !== true) {
    res.status(400).json({ error: "You must agree to every clause to sign." }); return;
  }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    const party = booking.companionId === companionId ? "companion" as const : "customer" as const;
    if (party === "customer" && booking.customerId !== customerId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (party === "companion" && booking.companionId !== companionId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    const view = await signBoundaryReceipt(id, party);
    await writeAudit({
      actorId: req.user?.id ?? customerId ?? companionId ?? "unknown",
      action: "boundary_receipt.sign",
      subjectType: "booking",
      subjectId: id,
      note: party,
    });
    res.json(view);
  } catch (err) {
    if (isMissingTableError(err)) {
      res.status(503).json({ error: "Boundary Receipts are not available yet. Apply migration 0009." }); return;
    }
    req.log.error({ err }, "Boundary receipt sign failed");
    res.status(503).json({ error: "Could not sign the Boundary Receipt" });
  }
});

router.get("/bookings/:id/session", async (req, res) => {
  const { id } = req.params;
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) {
    res.status(401).json({ error: "Authentication required" }); return;
  }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== customerId && booking.companionId !== companionId)) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!["confirmed", "authorized"].includes(booking.status)) {
      res.status(409).json({ error: "This favor is not active yet" }); return;
    }
    const [profile] = await db.select().from(companionProfiles).where(eq(companionProfiles.id, booking.companionId)).limit(1);
    let venue = { name: "Public SafeSpot", hint: "The agreed meeting venue is shared after your companion accepts.", agreed: false };
    if (venueRevealed(booking.status) && booking.safeSpotId) {
      const [spot] = await db.select().from(safespots).where(eq(safespots.id, booking.safeSpotId)).limit(1);
      if (spot) venue = { name: spot.name, hint: spot.addressHint, agreed: true };
    }
    const [checkIn] = await db.select().from(checkIns).where(eq(checkIns.bookingId, id)).limit(1);
    res.json({
      id: booking.id,
      status: booking.status,
      activity: booking.activity,
      date: booking.date,
      startTime: booking.startTime,
      durationHours: Number(booking.durationHours),
      companion: {
        name: profile?.displayName ?? "Your companion",
        boundaries: profile?.boundaries ?? ["Platonic only", "Public spaces only"],
      },
      venue,
      checkedInAt: checkIn?.createdAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json({
        id,
        status: "confirmed",
        activity: "Coffee conversation",
        date: new Date().toISOString().slice(0, 10),
        startTime: "10:00",
        durationHours: 2,
        companion: { name: "Your companion", boundaries: ["Platonic only", "Public spaces only"] },
        venue: { name: "Public SafeSpot", hint: "Approximate meeting area only until you arrive.", agreed: false },
        checkedInAt: null,
      });
      return;
    }
    req.log.error({ err }, "Favor session failed");
    res.status(503).json({ error: "Could not load this favor" });
  }
});

router.post("/bookings/:id/deposit", async (req, res) => {
  const { id } = AuthorizeDepositParams.parse(req.params);
  const customerId =
    getActorId(req, "customer");
  if (!customerId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!assertCanTransact(req, res)) return;

  try {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id));

    if (!booking || booking.customerId !== customerId) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const stripe = await getUncachableStripeClient();

    // $10 refundable deposit — idempotent: reuse existing PI if already created
    if (booking.depositPaymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(
        booking.depositPaymentIntentId,
      );
      res.json({
        bookingId: booking.id,
        amountCents: booking.depositCents,
        clientSecret: existing.client_secret,
        creditedToFinal: true,
      });
      return;
    }

    try {
      const receipt = await previewBoundaryReceipt(id);
      if (receipt && !receipt.customerAgreedAt) {
        res.status(409).json({ error: "Agree to the Boundary Receipt before paying." }); return;
      }
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
    }

    const pi = await stripe.paymentIntents.create({
      amount: booking.depositCents,
      currency: "usd",
      metadata: {
        bookingId: booking.id,
        customerId,
        type: "deposit",
      },
      // Deposit is refundable and credited to the final booking
    });

    await db
      .update(bookings)
      .set({ depositPaymentIntentId: pi.id })
      .where(eq(bookings.id, id));

    req.log.info(
      { bookingId: id, piId: pi.id },
      "Deposit payment intent created",
    );

    res.json({
      bookingId: booking.id,
      amountCents: booking.depositCents,
      clientSecret: pi.client_secret,
      creditedToFinal: true,
    });
  } catch (err) {
    req.log.error({ err }, "Unable to create deposit payment intent");
    res.status(503).json({ error: "Payments are not available until Stripe is connected" });
  }
});

router.post("/bookings/:id/authorize", async (req, res) => {
  const { id } = AuthorizeFullPaymentParams.parse(req.params);
  const customerId =
    getActorId(req, "customer");
  if (!customerId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!assertCanTransact(req, res)) return;

  try {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id));

    if (!booking || booking.customerId !== customerId) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    const stripe = await getUncachableStripeClient();

    // Idempotent — reuse existing PI if already created
    if (booking.fullPaymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(
        booking.fullPaymentIntentId,
      );
      res.json({
        bookingId: booking.id,
        amountCents: booking.totalCents,
        clientSecret: existing.client_secret,
        creditedToFinal: false,
      });
      return;
    }

    try {
      const receipt = await previewBoundaryReceipt(id);
      if (receipt && !receipt.customerAgreedAt) {
        res.status(409).json({ error: "Agree to the Boundary Receipt before paying." }); return;
      }
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
    }

    // Full payment: charge the platform account (separate charges and transfers).
    // Capture stays manual until checkout. Companion payout is a Transfer after complete.
    const pi = await stripe.paymentIntents.create({
      amount: booking.totalCents,
      currency: "usd",
      capture_method: "manual",
      transfer_group: booking.id,
      metadata: {
        bookingId: booking.id,
        customerId,
        companionId: booking.companionId,
        companionPayoutCents: String(booking.companionPayoutCents),
        platformRevenueCents: String(booking.platformRevenueCents),
        type: "full_payment",
      },
    });

    await db
      .update(bookings)
      .set({ fullPaymentIntentId: pi.id })
      .where(eq(bookings.id, id));

    req.log.info(
      { bookingId: id, piId: pi.id, totalCents: booking.totalCents },
      "Full payment intent created",
    );

    res.json({
      bookingId: booking.id,
      amountCents: booking.totalCents,
      clientSecret: pi.client_secret,
      creditedToFinal: false,
    });
  } catch (err) {
    req.log.error({ err }, "Unable to create full payment intent");
    res.status(503).json({ error: "Payments are not available until Stripe is connected" });
  }
});

// ---------------------------------------------------------------------------
// Companion booking inbox — view, accept, decline requests
// ---------------------------------------------------------------------------

router.get("/companion/bookings", async (req, res) => {
  const companionId = await resolveCompanionId(req);
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.companionId, companionId))
      .orderBy(desc(bookings.createdAt));
    res.json(await withReviewedFlag(rows.map(formatBookingFull)));
  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      res.json(Object.values(DEV_BOOKING_FIXTURES).filter((b: any) => b.companionId === companionId)); return;
    }
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Unable to list companion bookings");
    res.status(503).json({ error: "Bookings temporarily unavailable" });
  }
});

router.get("/companion/bookings/:id", async (req, res) => {
  const { id } = req.params;
  const companionId = await resolveCompanionId(req);
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || booking.companionId !== companionId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    const [payload] = await withReviewedFlag([formatBookingFull(booking)]);
    const boundaryReceipt = await loadBoundaryReceipt(booking.id);
    res.json({ ...payload, viewerRole: "companion", boundaryReceipt });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      const fixture = DEV_BOOKING_FIXTURES[id] as any;
      if (fixture && fixture.companionId === companionId) { res.json({ ...fixture, viewerRole: "companion" }); return; }
    }
    if (isMissingTableError(err)) { res.status(404).json({ error: "Booking not found" }); return; }
    req.log.error({ err }, "Unable to load companion booking");
    res.status(503).json({ error: "Booking temporarily unavailable" });
  }
});

router.post("/bookings/:id/accept", async (req, res) => {
  const { id } = req.params;
  if (!assertCanTransact(req, res)) return;
  const profile = await resolveCompanionProfile(req);
  if (!profile) { res.status(401).json({ error: "Authentication required" }); return; }
  if (!profile.approved) {
    res.status(403).json({ error: "Only an approved companion can accept bookings." }); return;
  }
  const companionId = profile.id;
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || booking.companionId !== companionId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!["deposit_paid", "authorized"].includes(booking.status)) {
      res.status(409).json({ error: "Booking cannot be accepted in its current state" }); return;
    }
    if (req.body?.agreeReceipt !== true) {
      res.status(400).json({ error: "Agree to the Boundary Receipt to accept. That agrees to the public SafeSpot and every listed boundary." }); return;
    }
    try {
      await signBoundaryReceipt(id, "companion");
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
    }
    assertBookingTransition(booking.status, "confirmed");
    const overlap = await companionHasOverlap({
      companionId,
      date: booking.date,
      startTime: booking.startTime,
      durationHours: Number(booking.durationHours),
      excludeBookingId: id,
      startsAt: booking.startsAt,
    });
    if (overlap) {
      res.status(409).json({ error: "That time overlaps another hold or confirmed booking." }); return;
    }
    const [updated] = await db
      .update(bookings)
      .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    await recordBookingEvent({ bookingId: id, fromStatus: booking.status, toStatus: "confirmed", actorId: req.user?.id, note: "accepted" });
    await notifyAccount(booking.customerId, {
      kind: "booking_accepted",
      title: "Booking confirmed",
      body: "Your companion accepted. Favor Mode opens at the scheduled start time.",
      href: `/booking/${id}`,
      audience: "customer",
    });
    res.json(formatBookingFull(updated));
  } catch (err: any) {
    // Dev fallback: mutate fixture in-memory
    if (process.env.NODE_ENV === "development") {
      const fixture = DEV_BOOKING_FIXTURES[id] as any;
      if (fixture) {
        if (!["deposit_paid", "authorized"].includes(fixture.status)) {
          res.status(409).json({ error: "Booking cannot be accepted in its current state" }); return;
        }
        fixture.status = "confirmed";
        fixture.confirmedAt = new Date().toISOString();
        res.json(fixture); return;
      }
    }
    if (isMissingTableError(err)) { res.status(503).json({ error: "Service temporarily unavailable" }); return; }
    req.log.error({ err }, "Unable to accept booking");
    res.status(503).json({ error: "Could not accept booking" });
  }
});

router.post("/bookings/:id/decline", async (req, res) => {
  const { id } = req.params;
  const companionId = await resolveCompanionId(req);
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || booking.companionId !== companionId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (["completed", "cancelled"].includes(booking.status)) {
      res.status(409).json({ error: "Booking cannot be declined in its current state" }); return;
    }
    try {
      await refundOrCancelIntent(booking.depositPaymentIntentId);
      await refundOrCancelIntent(booking.fullPaymentIntentId);
    } catch (payErr) {
      req.log.error({ payErr, bookingId: id }, "Decline refund failed");
      res.status(503).json({ error: "Could not refund this booking. Try again or email hello@onlyfavors.com." }); return;
    }
    const [updated] = await db
      .update(bookings)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    await recordBookingEvent({
      bookingId: id,
      fromStatus: booking.status,
      toStatus: "cancelled",
      actorId: req.user?.id,
      note: ["confirmed", "authorized"].includes(booking.status) ? "companion_cancelled" : "companion_declined",
    });
    await notifyAccount(booking.customerId, {
      kind: "booking_declined",
      title: "Booking not available",
      body: "Your companion could not take this date. You can browse others nearby.",
      href: "/explore",
      audience: "customer",
    });
    res.json(formatBookingFull(updated));
  } catch (err: any) {
    // Dev fallback: mutate fixture in-memory
    if (process.env.NODE_ENV === "development") {
      const fixture = DEV_BOOKING_FIXTURES[id] as any;
      if (fixture) {
        if (["completed", "cancelled"].includes(fixture.status)) {
          res.status(409).json({ error: "Booking cannot be declined in its current state" }); return;
        }
        fixture.status = "cancelled";
        fixture.cancelledAt = new Date().toISOString();
        res.json(fixture); return;
      }
    }
    if (isMissingTableError(err)) { res.status(503).json({ error: "Service temporarily unavailable" }); return; }
    req.log.error({ err }, "Unable to decline booking");
    res.status(503).json({ error: "Could not decline booking" });
  }
});

// In-memory set so a booking can only be checked-in once per server session
const checkedInBookings = new Set<string>();

router.post("/bookings/:id/extend", async (req, res) => {
  const { id } = req.params;
  const { extraMinutes } = req.body ?? {};
  if (!extraMinutes || typeof extraMinutes !== "number" || extraMinutes < 15) {
    res.status(400).json({ error: "extraMinutes must be at least 15" }); return;
  }

  // Dev fallback
  if (process.env.NODE_ENV === "development") {
    const fixture = DEV_BOOKING_FIXTURES[id] as any;
    if (fixture) {
      fixture.durationHours = (fixture.durationHours ?? 2) + extraMinutes / 60;
      req.log.info({ bookingId: id, extraMinutes }, "Booking extended (dev)");
      res.json({ ...fixture, extendedBy: extraMinutes }); return;
    }
    res.json({ id, extendedBy: extraMinutes }); return;
  }

  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (!["confirmed", "deposit_paid"].includes(booking.status)) {
      res.status(409).json({ error: "Booking cannot be extended in its current state" }); return;
    }
    const hours = Number(booking.durationHours) + extraMinutes / 60;
    const range = bookingRange(booking.date, booking.startTime, hours, booking.startsAt);
    const [updated] = await db
      .update(bookings)
      .set({ durationHours: String(hours), endsAt: range.end, updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    res.json({ ...formatBookingFull(updated), extendedBy: extraMinutes });
  } catch (err: any) {
    if (isExclusionViolation(err)) {
      res.status(409).json({ error: "That time overlaps another hold or confirmed booking." }); return;
    }
    if (isMissingTableError(err)) {
      res.json({ id, extendedBy: extraMinutes }); return;
    }
    req.log.error({ err }, "Failed to extend booking");
    res.status(503).json({ error: "Could not extend booking" });
  }
});

router.post("/bookings/:id/complete", async (req, res) => {
  const { id } = req.params;
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) { res.status(401).json({ error: "Authentication required" }); return; }

  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== customerId && booking.companionId !== companionId)) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!["confirmed", "authorized"].includes(booking.status)) {
      res.status(409).json({ error: "Booking is not in a completable state" }); return;
    }
    assertBookingTransition(booking.status, "completed");
    const [profile] = await db.select().from(companionProfiles).where(eq(companionProfiles.id, booking.companionId)).limit(1);
    const [openReport] = await db.select({ id: incidentReports.id }).from(incidentReports)
      .where(and(eq(incidentReports.bookingId, id), eq(incidentReports.status, "open")))
      .limit(1);
    const held = Boolean(booking.payoutHeld || profile?.payoutsHeld || openReport);
    if (booking.fullPaymentIntentId) {
      const captured = await captureIntentIfHeld(booking.fullPaymentIntentId);
      if (!captured.ok && captured.detail !== "already_captured") {
        req.log.error({ bookingId: id, captured }, "Capture on complete failed");
        res.status(503).json({ error: "Payment could not be captured. Try again or email hello@onlyfavors.com." }); return;
      }
    }
    let transferId = booking.stripeTransferId ?? null;
    const companionAccountId = profile?.stripeAccountId ?? devCompanionStripeAccounts.get(booking.companionId);
    if (!held && companionAccountId && !transferId) {
      const transferred = await transferCompanionPayout({
        bookingId: id,
        amountCents: booking.companionPayoutCents,
        destinationAccountId: companionAccountId,
      });
      if (transferred.ok) transferId = transferred.transferId ?? null;
      else req.log.warn({ bookingId: id, transferred }, "Companion transfer deferred");
    }
    const [updated] = await db
      .update(bookings)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
        ...(transferId ? { stripeTransferId: transferId } : {}),
      })
      .where(eq(bookings.id, id))
      .returning();
    await recordBookingEvent({
      bookingId: id,
      fromStatus: booking.status,
      toStatus: "completed",
      actorId: req.user?.id,
      note: held ? "completed_payout_held" : "completed",
    });
    await stopOrdinarySharing(id);
    await purgeExpiredLocations();
    res.json({ ...formatBookingFull(updated), payoutHeld: held });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      const fixture = DEV_BOOKING_FIXTURES[id] as any;
      if (fixture) {
        if (!["confirmed", "authorized"].includes(fixture.status)) {
          res.status(409).json({ error: "Booking is not in a completable state" }); return;
        }
        fixture.status = "completed";
        fixture.completedAt = new Date().toISOString();
        req.log.info({ bookingId: id }, "Booking completed (dev)");
        res.json(fixture); return;
      }
    }
    if (isMissingTableError(err)) {
      res.status(503).json({ error: "Could not complete booking" }); return;
    }
    req.log.error({ err }, "Failed to complete booking");
    res.status(503).json({ error: "Could not complete booking" });
  }
});

router.post("/bookings/:id/checkin", async (req, res) => {
  const { id } = req.params;
  const { venue } = req.body ?? {};
  const requestedKind = String(req.body?.kind ?? "arrival").slice(0, 40) || "arrival";
  const kind = requestedKind === "ok" ? "midpoint" : requestedKind;
  if (!["arrival", "midpoint", "checkout", "missed"].includes(kind)) {
    res.status(400).json({ error: "Check-in must be arrival, midpoint, or checkout." }); return;
  }
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (booking.customerId !== customerId && booking.companionId !== companionId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!["confirmed", "deposit_paid", "authorized"].includes(booking.status)) {
      res.status(409).json({ error: "Check-in not available for this booking" }); return;
    }
    const existing = await db.select().from(checkIns).where(and(eq(checkIns.bookingId, id), eq(checkIns.kind, kind))).limit(1);
    if (existing[0]) {
      res.json({ bookingId: id, checkedInAt: existing[0].createdAt, venue: existing[0].venue, kind, alreadyRecorded: true });
      return;
    }
    const accountId = req.user?.id ?? customerId ?? null;
    const [row] = await db.insert(checkIns).values({
      bookingId: id,
      accountId,
      venue: venue ? String(venue).slice(0, 120) : null,
      kind,
    }).returning();
    await notifyAccount(accountId, {
      kind: "safety",
      href: `/favor/${id}`,
      audience: booking.customerId === customerId ? "customer" : "companion",
    });
    req.log.info({ bookingId: id, venue, kind }, "SafeSpot check-in");
    const trust = kind === "arrival" || kind === "missed"
      ? await notifyTrustCircle(booking.customerId, {
          title: kind === "missed" ? "Missed check-in on OnlyFavors" : "SafeSpot check-in recorded",
          body: kind === "missed"
            ? "A booking check-in was not recorded on time. Ask your person if they are okay. Call 911 if this is an emergency. No companion name or live map is included."
            : `They checked in at the agreed public venue${venue ? ` (${String(venue).slice(0, 80)})` : ""}. This is not a live location.`,
        }).catch(() => ({ notified: 0, attempted: 0, reason: "Could not reach Trust Circle." }))
      : { notified: 0, attempted: 0, reason: undefined as string | undefined };
    res.json({
      bookingId: id,
      checkedInAt: row.createdAt,
      venue: row.venue,
      kind,
      smsNotified: false,
      trustNotified: trust.notified,
      reason: trust.reason ?? (process.env.TWILIO_AUTH_TOKEN ? "SMS sending is not wired yet" : "SMS is not configured"),
    });
  } catch (err: unknown) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      checkedInBookings.add(id);
      res.json({ bookingId: id, checkedInAt: new Date().toISOString(), venue, kind });
      return;
    }
    req.log.error({ err }, "Check-in failed");
    res.status(503).json({ error: "Could not record check-in" });
  }
});

router.post("/bookings/:id/exact-location", async (req, res) => {
  const { id } = req.params;
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const kind = String(req.body?.kind ?? "checkin").slice(0, 40);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: "A valid latitude and longitude are required" }); return;
  }
  if (!locationEncryptionReady()) {
    res.status(503).json({ error: "Exact location storage is not configured" }); return;
  }
  try {
    await purgeExpiredLocations();
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== customerId && booking.companionId !== companionId)) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!SHARING_STATUSES.has(booking.status)) {
      res.status(409).json({ error: "Exact location is only stored during an active booking" }); return;
    }
    const ciphertext = encryptExactLocation({ lat, lng });
    const expiresAt = new Date(Date.now() + LOCATION_RETENTION_MS);
    await db.delete(exactLocations).where(eq(exactLocations.bookingId, id));
    await db.insert(exactLocations).values({
      bookingId: id,
      ciphertext,
      expiresAt,
      sharing: true,
      accountId: req.user?.id ?? customerId ?? null,
      kind: ["checkin", "walk", "emergency"].includes(kind) ? kind : "checkin",
    });
    req.log.info({ bookingId: id, kind }, "Exact location stored encrypted");
    res.json({ stored: true, sharing: true, expiresAt: expiresAt.toISOString(), retentionHours: 24 });
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json({ stored: true, sharing: true, expiresAt: new Date(Date.now() + LOCATION_RETENTION_MS).toISOString(), retentionHours: 24 }); return;
    }
    req.log.error({ err }, "Exact location store failed");
    res.status(503).json({ error: "Could not store exact location" });
  }
});

router.post("/bookings/:id/exact-location/stop", async (req, res) => {
  const { id } = req.params;
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== customerId && booking.companionId !== companionId)) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    await stopOrdinarySharing(id);
    res.json({ sharing: false });
  } catch (err) {
    req.log.error({ err }, "Stop location sharing failed");
    res.status(503).json({ error: "Could not stop location sharing" });
  }
});

router.get("/bookings/:id/exact-location", async (req, res) => {
  const { id } = req.params;
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    await purgeExpiredLocations();
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== customerId && booking.companionId !== companionId)) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    const [row] = await db.select().from(exactLocations).where(eq(exactLocations.bookingId, id)).orderBy(desc(exactLocations.createdAt)).limit(1);
    if (!row || row.expiresAt.getTime() < Date.now()) {
      if (row) await db.delete(exactLocations).where(eq(exactLocations.bookingId, id));
      res.json({ stored: false, sharing: false });
      return;
    }
    res.json({
      stored: true,
      sharing: row.sharing,
      kind: row.kind,
      expiresAt: row.expiresAt.toISOString(),
      retentionHours: 24,
    });
  } catch (err) {
    req.log.error({ err }, "Exact location status failed");
    res.json({ stored: false, sharing: false });
  }
});

router.post("/bookings/:id/trust-link", async (req, res) => {
  const { id } = req.params;
  const limited = rateLimit(clientKey(req.ip, `trust-link:${id}`), 8, 15 * 60_000);
  if (!limited.ok) {
    res.status(429).json({ error: "Too many share links. Try again later." }); return;
  }
  const customerId = getActorId(req, "customer");
  if (!customerId) { res.status(401).json({ error: "Authentication required" }); return; }
  const purpose = String(req.body?.purpose ?? "trust_circle");
  if (!["trust_circle", "walk"].includes(purpose)) {
    res.status(400).json({ error: "Unknown share purpose" }); return;
  }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || booking.customerId !== customerId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!SHARING_STATUSES.has(booking.status)) {
      res.status(409).json({ error: "A Trust Circle map is only available during an active booking" }); return;
    }
    const token = mintShareToken();
    const expiresAt = new Date(Date.now() + LOCATION_RETENTION_MS);
    await db.insert(locationShareLinks).values({
      bookingId: id,
      accountId: customerId,
      tokenHash: hashShareToken(token),
      purpose,
      expiresAt,
    });
    const path = `/safety/share/${token}`;
    const origin = String(req.headers.origin ?? "").replace(/\/$/, "");
    const href = origin ? `${origin}${path}` : path;
    const trust = await notifyTrustCircle(customerId, {
      title: purpose === "walk" ? "OnlyFavors walk-me-there map" : "OnlyFavors safety map",
      body: "Your person shared a temporary map of the agreed public venue. This is not a live GPS pin of a person, and the link expires after the booking.",
      href,
    }).catch(() => ({ notified: 0, attempted: 0, reason: "Could not reach Trust Circle." }));
    res.json({ path, expiresAt: expiresAt.toISOString(), purpose, trustNotified: trust.notified, reason: trust.reason });
  } catch (err) {
    if (isMissingTableError(err)) {
      res.status(503).json({ error: "Location links are not available yet. Apply migration 0008." }); return;
    }
    req.log.error({ err }, "Trust link create failed");
    res.status(503).json({ error: "Could not create a Trust Circle link" });
  }
});

router.post("/bookings/:id/missed-checkin", async (req, res) => {
  const { id } = req.params;
  const limited = rateLimit(clientKey(req.ip, `missed:${id}`), 4, 15 * 60_000);
  if (!limited.ok) {
    res.status(429).json({ error: "Too many missed-check-in alerts." }); return;
  }
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== customerId && booking.companionId !== companionId)) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!SHARING_STATUSES.has(booking.status)) {
      res.status(409).json({ error: "Missed check-in alerts are only for an active favor." }); return;
    }
    const [arrival] = await db.select().from(checkIns).where(and(eq(checkIns.bookingId, id), eq(checkIns.kind, "arrival"))).limit(1);
    if (arrival) {
      res.json({ alerted: false, reason: "A check-in was already recorded." }); return;
    }
    const [already] = await db.select().from(checkIns).where(and(eq(checkIns.bookingId, id), eq(checkIns.kind, "missed"))).limit(1);
    if (already) {
      res.json({ alerted: true, reason: "Trust Circle was already notified about a missed check-in." }); return;
    }
    const trust = await notifyTrustCircle(booking.customerId, {
      title: "Missed check-in on OnlyFavors",
      body: "A booking check-in was not recorded on time. Ask your person if they are okay. Call 911 if this is an emergency. No companion name or live map is included.",
    });
    await db.insert(checkIns).values({
      bookingId: id,
      accountId: req.user?.id ?? customerId ?? null,
      venue: null,
      kind: "missed",
    });
    res.json({ alerted: trust.notified > 0, ...trust });
  } catch (err) {
    req.log.error({ err }, "Missed check-in alert failed");
    res.status(503).json({ error: "Could not alert Trust Circle", reason: "Notification failed. Call 911 if this is an emergency." });
  }
});

router.post("/bookings/:id/emergency-share", async (req, res) => {
  const { id } = req.params;
  const limited = rateLimit(clientKey(req.ip, `emergency:${id}`), 6, 15 * 60_000);
  if (!limited.ok) {
    res.status(429).json({ error: "Too many emergency shares. Call 911 if this is an emergency." }); return;
  }
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== customerId && booking.companionId !== companionId)) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (locationEncryptionReady() && Number.isFinite(lat) && Number.isFinite(lng)) {
      const ciphertext = encryptExactLocation({ lat, lng });
      const expiresAt = new Date(Date.now() + LOCATION_RETENTION_MS);
      await db.delete(exactLocations).where(eq(exactLocations.bookingId, id));
      await db.insert(exactLocations).values({
        bookingId: id,
        ciphertext,
        expiresAt,
        sharing: true,
        accountId: req.user?.id ?? customerId ?? null,
        kind: "emergency",
      });
    }
    const token = mintShareToken();
    const expiresAt = new Date(Date.now() + LOCATION_RETENTION_MS);
    const accountId = req.user?.id ?? customerId ?? booking.customerId;
    try {
      await db.insert(locationShareLinks).values({
        bookingId: id,
        accountId,
        tokenHash: hashShareToken(token),
        purpose: "emergency",
        expiresAt,
      });
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
    }
    const path = `/safety/share/${token}`;
    const origin = String(req.headers.origin ?? "").replace(/\/$/, "");
    const href = origin ? `${origin}${path}` : path;
    const trust = await notifyTrustCircle(booking.customerId, {
      title: "OnlyFavors emergency share",
      body: "Your person asked OnlyFavors to share a temporary safety map. Call 911 if they may be in danger. This link expires in 24 hours and is not a live GPS pin.",
      href,
    });
    await writeAudit({
      actorId: accountId,
      action: "emergency_location_share",
      subjectType: "booking",
      subjectId: id,
      note: `trust_notified=${trust.notified}`,
    });
    res.json({
      call911: true,
      path,
      expiresAt: expiresAt.toISOString(),
      ...trust,
    });
  } catch (err) {
    req.log.error({ err }, "Emergency share failed");
    res.status(503).json({ error: "Could not share location. Call 911 if this is an emergency." });
  }
});

router.get("/safety/share/:token", async (req, res) => {
  const limited = rateLimit(clientKey(req.ip, "share"), 30, 15 * 60_000);
  if (!limited.ok) {
    res.status(429).json({ error: "Too many requests" }); return;
  }
  const token = String(req.params.token ?? "");
  if (token.length < 16) { res.status(404).json({ error: "This link is not available" }); return; }
  try {
    await purgeExpiredLocations();
    const [link] = await db.select().from(locationShareLinks).where(eq(locationShareLinks.tokenHash, hashShareToken(token))).limit(1);
    if (!link || link.revokedAt || link.expiresAt.getTime() < Date.now()) {
      res.status(404).json({ error: "This link has expired or was stopped." }); return;
    }
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, link.bookingId)).limit(1);
    if (!booking) { res.status(404).json({ error: "This link is not available" }); return; }
    let venue: { name: string; hint: string; area?: { name: string; lat: number; lng: number } } | null = null;
    if (venueRevealed(booking.status) && booking.safeSpotId) {
      const [spot] = await db.select().from(safespots).where(eq(safespots.id, booking.safeSpotId)).limit(1);
      if (spot) {
        const area = neighborhoodCenter(`${spot.addressHint} ${spot.city}`);
        venue = { name: spot.name, hint: spot.addressHint, area };
      }
    }
    let lastCheckIn: { lat: number; lng: number } | null = null;
    if (link.purpose === "emergency") {
      const [row] = await db.select().from(exactLocations).where(eq(exactLocations.bookingId, booking.id)).orderBy(desc(exactLocations.createdAt)).limit(1);
      if (row && row.expiresAt.getTime() >= Date.now() && locationEncryptionReady()) {
        try { lastCheckIn = decryptExactLocation(row.ciphertext); } catch { lastCheckIn = null; }
      }
    }
    const [account] = await db.select().from(accounts).where(eq(accounts.id, link.accountId)).limit(1);
    const firstName = (account?.displayName ?? "Someone").trim().split(/\s+/)[0];
    res.json({
      purpose: link.purpose,
      firstName,
      activity: booking.activity,
      venue,
      lastCheckIn: lastCheckIn ? { ...lastCheckIn, live: false } : null,
      expiresAt: link.expiresAt.toISOString(),
      livePin: false,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      res.status(404).json({ error: "This link is not available" }); return;
    }
    req.log.error({ err }, "Share link read failed");
    res.status(404).json({ error: "This link is not available" });
  }
});

router.post("/bookings/:id/cancel", async (req, res) => {
  const { id } = req.params;
  const customerId =
    getActorId(req, "customer");
  if (!customerId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { reason } = req.body ?? {};
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || booking.customerId !== customerId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (["completed", "cancelled"].includes(booking.status)) {
      res.status(409).json({ error: "Booking cannot be cancelled" }); return;
    }
    const plan = customerCancelPlan(booking);
    try {
      if (plan.refundDeposit) await refundOrCancelIntent(booking.depositPaymentIntentId);
      if (plan.refundFull) await refundOrCancelIntent(booking.fullPaymentIntentId, plan.refundFullAmountCents);
    } catch (payErr) {
      req.log.error({ payErr, bookingId: id }, "Cancel refund failed");
      res.status(503).json({ error: "Could not refund this booking. Email hello@onlyfavors.com." }); return;
    }
    const [updated] = await db
      .update(bookings)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    await recordBookingEvent({
      bookingId: id,
      fromStatus: booking.status,
      toStatus: "cancelled",
      actorId: customerId,
      note: plan.keepFeeCents ? `late_cancel_fee_${plan.keepFeeCents}` : "customer_cancel",
    });
    req.log.info({ bookingId: id, reason, keepFeeCents: plan.keepFeeCents }, "Booking cancelled by customer");
    await stopOrdinarySharing(id);
    res.json({ ...formatBookingFull(updated), keepFeeCents: plan.keepFeeCents });
  } catch (err: any) {
    if (isMissingTableError(err)) { res.status(503).json({ error: "Could not cancel booking" }); return; }
    req.log.error({ err }, "Unable to cancel booking");
    res.status(503).json({ error: "Could not cancel booking" });
  }
});

// ---------------------------------------------------------------------------
// Structured Favor Requests — free, no chat until deposit paid
// ---------------------------------------------------------------------------

router.post("/favor-requests", async (req, res) => {
  const body = CreateFavorRequestBody.parse(req.body);
  const customerId =
    getActorId(req, "customer");
  if (!customerId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!assertCanTransact(req, res)) return;

  try {
    const [request] = await db
      .insert(favorRequests)
      .values({
        customerId,
        companionId: body.companionId,
        activity: body.activity,
        // Zod coerces format:date to Date — serialize back
        preferredDate:
          body.preferredDate instanceof Date
            ? body.preferredDate.toISOString().split("T")[0]
            : String(body.preferredDate),
        preferredDurationHours: String(body.preferredDurationHours),
        locationType: body.locationType ?? null,
        accessibilityNeeds: body.accessibilityNeeds ?? null,
        dressCode: body.dressCode ?? null,
        additionalQuestions: body.additionalQuestions ?? null,
        status: "pending",
      })
      .returning();

    req.log.info(
      { requestId: request.id, companionId: body.companionId },
      "Favor request sent",
    );

    res.status(201).json({
      id: request.id,
      status: request.status,
      companionId: request.companionId,
      activity: request.activity,
      preferredDate: request.preferredDate,
      preferredDurationHours: Number(request.preferredDurationHours),
      createdAt: request.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Unable to create favor request");
    res.status(500).json({ error: "Unable to send favor request" });
  }
});

// ---------------------------------------------------------------------------
// Dashboards — auth required
// ---------------------------------------------------------------------------

router.get("/dashboard/customer", async (req, res) => {
  const customerId =
    getActorId(req, "customer");
  if (!customerId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const rows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.customerId, customerId));
    const upcomingCount = rows.filter((b) =>
      ["requested", "authorized", "deposit_paid", "confirmed"].includes(b.status),
    ).length;
    const completed = rows.filter((b) => b.status === "completed");
    const spentCents = completed.reduce((sum, b) => sum + b.totalCents, 0);
    const hoursTogether = completed.reduce((sum, b) => sum + Number(b.durationHours || 0), 0);
    let savedCount = 0;
    try {
      const saved = await db.select().from(savedCompanions).where(eq(savedCompanions.accountId, customerId));
      savedCount = saved.length;
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
    }

    res.json({
      upcomingBookings: upcomingCount,
      completedBookings: completed.length,
      savedCompanions: savedCount,
      safetyPlans: upcomingCount,
      spentCents,
      hoursTogether,
    });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      const devBookings = Object.values(DEV_BOOKING_FIXTURES) as any[];
      const mine = devBookings.filter((b) => b.customerId === customerId);
      const upcomingCount = mine.filter((b) => ["requested", "authorized", "deposit_paid", "confirmed"].includes(b.status)).length;
      const completedCount = mine.filter((b) => b.status === "completed").length;
      res.json({ upcomingBookings: upcomingCount, completedBookings: completedCount, savedCompanions: 0, safetyPlans: upcomingCount, spentCents: 0, hoursTogether: 0 }); return;
    }
    // Tables don't exist yet (schema created in Task #1) — check full error chain
    if (isMissingTableError(err)) {
      req.log.warn("Dashboard tables not yet created — returning empty stats");
      res.json({ upcomingBookings: 0, completedBookings: 0, savedCompanions: 0, safetyPlans: 0, spentCents: 0, hoursTogether: 0 });
      return;
    }
    req.log.error({ err }, "Unable to load customer dashboard");
    res.status(503).json({ error: "Dashboard temporarily unavailable" });
  }
});

router.get("/dashboard/companion", async (req, res) => {
  if (!req.user?.id || req.user.suspended) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!isCompanionUser(req)) {
    res.status(403).json({ error: "Companion role required" });
    return;
  }
  const companionId = await resolveCompanionId(req);
  if (!companionId) {
    res.json({ pendingRequests: 0, upcomingBookings: 0, earningsCents: 0, profileViews: 0, avgRating: null, reviewCount: 0 });
    return;
  }

  try {
    const [companionBookings, companionRequests] = await Promise.all([
      db.select().from(bookings).where(eq(bookings.companionId, companionId)),
      db.select().from(favorRequests).where(eq(favorRequests.companionId, companionId)),
    ]);
    const pendingReqs = companionRequests.filter((r) => r.status === "pending").length
      + companionBookings.filter((b) => b.status === "requested").length;
    const upcomingCount = companionBookings.filter((b) =>
      ["authorized", "deposit_paid", "confirmed"].includes(b.status),
    ).length;
    const earningsCents = companionBookings
      .filter((b) => b.status === "completed")
      .reduce((sum, b) => sum + b.companionPayoutCents, 0);
    let avgRating: number | null = null;
    let reviewCount = 0;
    try {
      const ratingRows = await db.select({ rating: reviewRows.rating }).from(reviewRows).where(eq(reviewRows.companionId, companionId));
      reviewCount = ratingRows.length;
      if (reviewCount) {
        avgRating = Math.round((ratingRows.reduce((sum, r) => sum + r.rating, 0) / reviewCount) * 10) / 10;
      }
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
    }

    res.json({ pendingRequests: pendingReqs, upcomingBookings: upcomingCount, earningsCents, profileViews: 0, avgRating, reviewCount });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      const devBookings = Object.values(DEV_BOOKING_FIXTURES) as any[];
      const mine = devBookings.filter((b) => b.companionId === companionId);
      const pendingReqs = mine.filter((b) => b.status === "requested").length;
      const upcomingCount = mine.filter((b) => ["authorized", "deposit_paid", "confirmed"].includes(b.status)).length;
      const earningsCents = mine.filter((b) => b.status === "completed").reduce((s: number, b: any) => s + b.companionPayoutCents, 0);
      res.json({ pendingRequests: pendingReqs, upcomingBookings: upcomingCount, earningsCents, profileViews: 0, avgRating: null, reviewCount: 0 }); return;
    }
    // Tables don't exist yet (schema created in Task #1) — check full error chain
    if (isMissingTableError(err)) {
      req.log.warn("Dashboard tables not yet created — returning empty stats");
      res.json({ pendingRequests: 0, upcomingBookings: 0, earningsCents: 0, profileViews: 0, avgRating: null, reviewCount: 0 });
      return;
    }
    req.log.error({ err }, "Unable to load companion dashboard");
    res.status(503).json({ error: "Dashboard temporarily unavailable" });
  }
});

// ---------------------------------------------------------------------------
// In-booking messages — one thread per booking, gated behind deposit
// ---------------------------------------------------------------------------

/** Dev in-memory message store — replaced by DB writes once Supabase is live */
type DevMessage = { id: string; bookingId: string; senderId: string; senderRole: string; body: string; createdAt: string };
const devMessages = new Map<string, DevMessage[]>();

/** Strip phone numbers and email addresses to prevent off-platform contact */
function maskBody(body: string): string {
  return body
    .replace(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "[number removed]")
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, "[email removed]");
}

const CHAT_STATUSES = ["deposit_paid", "authorized", "confirmed", "completed"];

router.get("/bookings/:id/messages", async (req, res) => {
  const { id } = req.params;
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) { res.status(401).json({ error: "Authentication required" }); return; }

  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== customerId && booking.companionId !== companionId)) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!CHAT_STATUSES.includes(booking.status)) {
      res.status(403).json({ error: "Chat unlocks after deposit is paid" }); return;
    }
    // Try DB first, fall back to in-memory for dev
    try {
      const rows = await db.select().from(messages).where(eq(messages.bookingId, id));
      res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
    } catch (err: any) {
      if (isMissingTableError(err)) { res.json(devMessages.get(id) ?? []); return; }
      throw err;
    }
  } catch (err: any) {
    if (isMissingTableError(err)) { res.json(devMessages.get(id) ?? []); return; }
    req.log.error({ err }, "Failed to load messages");
    res.status(503).json({ error: "Messages temporarily unavailable" });
  }
});

router.post("/bookings/:id/messages", async (req, res) => {
  const { id } = req.params;
  const customerId = getActorId(req, "customer");
  const companionId = await resolveCompanionId(req);
  if (!customerId && !companionId) { res.status(401).json({ error: "Authentication required" }); return; }

  const rawBody = String(req.body?.body ?? "").trim();
  if (!rawBody) { res.status(400).json({ error: "Message body is required" }); return; }
  if (rawBody.length > 500) { res.status(400).json({ error: "Message exceeds 500 characters" }); return; }
  const body = maskBody(rawBody);

  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== customerId && booking.companionId !== companionId)) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!CHAT_STATUSES.includes(booking.status)) {
      res.status(403).json({ error: "Chat unlocks after deposit is paid" }); return;
    }
    const senderRole = booking.companionId === companionId ? "companion" : "customer";
    const senderId = req.user?.id ?? customerId ?? companionId ?? "unknown";

    try {
      const [msg] = await db.insert(messages).values({ bookingId: id, senderId, senderRole, body }).returning();
      res.status(201).json({ ...msg, createdAt: msg.createdAt.toISOString() });
    } catch (err: any) {
      if (isMissingTableError(err)) {
        // Dev fallback — store in memory
        const msg: DevMessage = { id: crypto.randomUUID(), bookingId: id, senderId, senderRole, body, createdAt: new Date().toISOString() };
        if (!devMessages.has(id)) devMessages.set(id, []);
        devMessages.get(id)!.push(msg);
        res.status(201).json(msg); return;
      }
      throw err;
    }
  } catch (err: any) {
    if (isMissingTableError(err)) {
      const msg: DevMessage = { id: crypto.randomUUID(), bookingId: id, senderId: req.user?.id ?? customerId ?? companionId ?? "unknown", senderRole: companionId && !customerId ? "companion" : "customer", body, createdAt: new Date().toISOString() };
      if (!devMessages.has(id)) devMessages.set(id, []);
      devMessages.get(id)!.push(msg);
      res.status(201).json(msg); return;
    }
    req.log.error({ err }, "Failed to send message");
    res.status(503).json({ error: "Could not send message" });
  }
});

// ---------------------------------------------------------------------------
// Reviews — submitted by customers after completed bookings
// ---------------------------------------------------------------------------

type DevReview = {
  id: string;
  bookingId: string;
  companionId: string;
  customerId: string;
  rating: number;
  comment: string;
  createdAt: string;
};

const devReviews: DevReview[] = [];

/** bookingIds that have already been reviewed, to enforce one-review-per-booking */
const reviewedBookings = new Set<string>();

router.post("/companions/:id/report", async (req, res) => {
  const { id } = req.params;
  const { reason, note } = req.body ?? {};
  if (!reason) { res.status(400).json({ error: "A reason is required" }); return; }
  const limited = rateLimit(clientKey(req.ip, `report:${req.user?.id ?? req.ip}`), 6, 15 * 60_000);
  if (!limited.ok) {
    res.status(429).json({ error: "Too many reports. Try again shortly." }); return;
  }
  try {
    const [row] = await db.insert(incidentReports).values({
      reporterId: req.user?.id ?? null,
      companionId: id,
      reportType: String(reason).slice(0, 80),
      detail: String(note ?? reason).slice(0, 1500),
      urgent: false,
    }).returning();
    req.log.warn({ companionId: id, reportId: row.id }, "Companion report submitted");
    await writeAudit({
      actorId: req.user?.id ?? "anonymous",
      action: "report.create",
      subjectType: "incident_report",
      subjectId: row.id,
      note: `companion:${id}`,
    });
    res.json({ received: true, id: row.id, message: "Report received. The other person is not notified. It is stored for the trust team.", reportedUserNotified: false });
  } catch (err: unknown) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json({ received: true, message: "Report received. It is stored for the trust team. There is no published review SLA." });
      return;
    }
    req.log.error({ err }, "Companion report failed");
    res.status(503).json({ error: "Could not submit report" });
  }
});

router.post("/reports", async (req, res) => {
  const { reportType, detail, bookingRef, urgent, companionId } = req.body ?? {};
  if (!reportType || !String(detail ?? "").trim()) {
    res.status(400).json({ error: "Incident type and details are required" }); return;
  }
  const limited = rateLimit(clientKey(req.ip, `report:${req.user?.id ?? req.ip}`), 6, 15 * 60_000);
  if (!limited.ok) {
    res.status(429).json({ error: "Too many reports. Try again shortly." }); return;
  }
  try {
    const [row] = await db.insert(incidentReports).values({
      reporterId: req.user?.id ?? null,
      companionId: companionId ? String(companionId) : null,
      bookingId: bookingRef ? String(bookingRef).slice(0, 80) : null,
      reportType: String(reportType).slice(0, 80),
      detail: String(detail).slice(0, 1500),
      urgent: Boolean(urgent),
      riskLevel: urgent ? "high" : "standard",
    }).returning();
    await writeAudit({
      actorId: req.user?.id ?? "anonymous",
      action: "report.create",
      subjectType: "incident_report",
      subjectId: row.id,
      note: row.bookingId ? `booking:${row.bookingId}` : row.companionId,
    });
    if (row.bookingId) {
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, row.bookingId)).limit(1);
      const actorCompanionId = await resolveCompanionId(req);
      const reporterIsParty = Boolean(
        booking && req.user?.id && (
          booking.customerId === req.user.id ||
          (actorCompanionId && booking.companionId === actorCompanionId)
        ),
      );
      if (booking && reporterIsParty) {
        await db.update(bookings).set({ payoutHeld: true, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
        await writeAudit({
          actorId: req.user!.id,
          action: "booking.payout_hold",
          subjectType: "booking",
          subjectId: booking.id,
          note: "open_safety_report",
        });
      }
    }
    res.status(201).json({ id: row.id, status: row.status, reportedUserNotified: false });
  } catch (err: unknown) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.status(201).json({ id: `dev-report-${Date.now()}`, status: "open" });
      return;
    }
    req.log.error({ err }, "Safety report failed");
    res.status(503).json({ error: "Could not submit report" });
  }
});

function publicCompanionReview(row: { id: string; rating: number; comment: string | null; createdAt: Date | string }) {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment ?? "",
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

router.get("/companions/:id/reviews", async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await db
      .select({
        id: reviewRows.id,
        rating: reviewRows.rating,
        comment: reviewRows.comment,
        createdAt: reviewRows.createdAt,
      })
      .from(reviewRows)
      .where(eq(reviewRows.companionId, id))
      .orderBy(desc(reviewRows.createdAt));
    res.json(rows.map(publicCompanionReview));
  } catch (err: unknown) {
    if (isMissingTableError(err)) {
      res.json(devReviews.filter((r) => r.companionId === id).map(publicCompanionReview));
      return;
    }
    req.log.error({ err }, "Reviews lookup failed");
    res.status(503).json({ error: "Reviews temporarily unavailable" });
  }
});

router.get("/reviews/recent", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: reviewRows.id,
        rating: reviewRows.rating,
        comment: reviewRows.comment,
        createdAt: reviewRows.createdAt,
        companionId: reviewRows.companionId,
        companionName: companionProfiles.displayName,
        city: companionProfiles.city,
      })
      .from(reviewRows)
      .innerJoin(companionProfiles, eq(reviewRows.companionId, companionProfiles.id))
      .where(and(eq(companionProfiles.approved, true), eq(companionProfiles.paused, false)))
      .orderBy(desc(reviewRows.createdAt))
      .limit(24);
    res.json(
      rows
        .filter((row) => Boolean(row.comment?.trim()))
        .slice(0, 12)
        .map((row) => ({
          id: row.id,
          rating: row.rating,
          comment: row.comment,
          createdAt: row.createdAt.toISOString(),
          companionId: row.companionId,
          companionName: publicFirstName(row.companionName),
          city: row.city,
        })),
    );
  } catch (err) {
    if (isMissingTableError(err)) {
      res.json([]);
      return;
    }
    req.log.error({ err }, "Recent reviews failed");
    res.json([]);
  }
});

router.get("/bookings/:id/review", async (req, res) => {
  const { id } = req.params;
  const customerId = getActorId(req, "customer");
  if (!customerId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [review] = await db.select().from(reviewRows)
      .where(and(eq(reviewRows.bookingId, id), eq(reviewRows.customerId, customerId)))
      .limit(1);
    if (!review) { res.status(404).json({ error: "Review not found" }); return; }
    res.json(review);
  } catch (err) {
    if (isMissingTableError(err)) { res.status(404).json({ error: "Review not found" }); return; }
    req.log.error({ err }, "Review lookup failed");
    res.status(503).json({ error: "Could not load review" });
  }
});

router.post("/bookings/:id/review", async (req, res) => {
  const { id } = req.params;
  const customerId =
    getActorId(req, "customer");
  if (!customerId) { res.status(401).json({ error: "Authentication required" }); return; }

  const { rating, comment } = req.body ?? {};
  if (typeof rating !== "number" || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    res.status(400).json({ error: "Rating must be a whole number between 1 and 5" }); return;
  }
  if (comment && String(comment).length > 300) {
    res.status(400).json({ error: "Comment must be 300 characters or fewer" }); return;
  }

  if (reviewedBookings.has(id)) {
    res.status(409).json({ error: "You have already reviewed this booking" }); return;
  }

  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || booking.customerId !== customerId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (booking.status !== "completed") {
      res.status(403).json({ error: "Reviews are only available after a booking is completed" }); return;
    }

    const existingReview = await db.select().from(reviewRows).where(eq(reviewRows.bookingId, id)).limit(1);
    if (existingReview[0]) {
      res.status(409).json({ error: "You have already reviewed this booking" }); return;
    }

    const [review] = await db.insert(reviewRows).values({
      bookingId: id,
      companionId: booking.companionId,
      customerId,
      rating,
      comment: comment ? String(comment).trim().slice(0, 300) : null,
    }).returning();

    const stats = await db
      .select({
        avg: sql<number>`avg(${reviewRows.rating})`,
        count: sql<number>`count(*)`,
      })
      .from(reviewRows)
      .where(eq(reviewRows.companionId, booking.companionId));
    await db.update(companionProfiles).set({
      rating: String(Number(stats[0]?.avg ?? rating).toFixed(2)),
      reviewCount: Number(stats[0]?.count ?? 1),
      updatedAt: new Date(),
    }).where(eq(companionProfiles.id, booking.companionId));

    req.log.info({ bookingId: id, rating }, "Review submitted");
    try {
      const [profile] = await db.select().from(companionProfiles).where(eq(companionProfiles.id, booking.companionId)).limit(1);
      await notifyAccount(profile?.accountId, {
        kind: "review",
        title: "You have a new review",
        body: `A customer rated a completed booking ${rating} star${rating === 1 ? "" : "s"}.`,
        href: "/dashboard/companion",
        audience: "companion",
      });
    } catch { /* best-effort */ }
    res.status(201).json(review);
  } catch (err: unknown) {
    if (isMissingTableError(err)) {
      const fixtureBooking = DEV_BOOKING_FIXTURES[id] as any;
      if (!fixtureBooking) {
        res.status(404).json({ error: "Booking not found" }); return;
      }
      const review: DevReview = {
        id: crypto.randomUUID(),
        bookingId: id,
        companionId: fixtureBooking.companionId,
        customerId,
        rating,
        comment: comment ? String(comment).trim() : "",
        createdAt: new Date().toISOString(),
      };
      devReviews.push(review);
      reviewedBookings.add(id);
      res.status(201).json(review);
      return;
    }
    req.log.error({ err }, "Failed to save review");
    res.status(503).json({ error: "Could not save review" });
  }
});

// ---------------------------------------------------------------------------
// Companion earnings
// ---------------------------------------------------------------------------

type EarningsMonth = { month: string; label: string; earningsCents: number; bookingCount: number };

router.get("/companion/earnings", async (req, res) => {
  const companionId = await resolveCompanionId(req);
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }

  try {
    const rows = await db.select().from(bookings).where(eq(bookings.companionId, companionId));
    const completed = rows.filter((b) => b.status === "completed");
    const pending = rows.filter((b) => ["authorized", "confirmed", "deposit_paid"].includes(b.status));
    const months = new Map<string, { month: string; label: string; earningsCents: number; bookingCount: number }>();
    for (const row of completed) {
      const month = row.date.slice(0, 7);
      const existing = months.get(month) ?? {
        month,
        label: new Date(`${month}-01`).toLocaleString("en-US", { month: "short" }),
        earningsCents: 0,
        bookingCount: 0,
      };
      existing.earningsCents += row.companionPayoutCents;
      existing.bookingCount += 1;
      months.set(month, existing);
    }
    const monthlyBreakdown = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
    const currentMonth = new Date().toISOString().slice(0, 7);
    res.json({
      lifetimeCents: completed.reduce((s, b) => s + b.companionPayoutCents, 0),
      thisMonthCents: monthlyBreakdown.find((m) => m.month === currentMonth)?.earningsCents ?? 0,
      pendingCents: pending.reduce((s, b) => s + b.companionPayoutCents, 0),
      thisYearCents: completed.filter((b) => b.date.startsWith(String(new Date().getFullYear()))).reduce((s, b) => s + b.companionPayoutCents, 0),
      monthlyBreakdown,
      recentTransactions: completed.slice(-8).reverse().map((b) => ({
        id: b.id,
        bookingId: b.id,
        date: b.completedAt?.toISOString() ?? b.updatedAt.toISOString(),
        activity: b.activity,
        durationHours: Number(b.durationHours),
        grossCents: b.subtotalCents,
        commissionCents: b.subtotalCents - b.companionPayoutCents,
        netCents: b.companionPayoutCents,
        status: "paid",
      })),
      totalBookings: completed.length,
    });
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json({
        lifetimeCents: 0, thisMonthCents: 0, pendingCents: 0, thisYearCents: 0,
        monthlyBreakdown: [], recentTransactions: [], totalBookings: 0,
      });
      return;
    }
    req.log.error({ err }, "Earnings lookup failed");
    res.status(503).json({ error: "Earnings temporarily unavailable" });
  }
});

// ---------------------------------------------------------------------------
// Notifications — in-app alerts for booking events and messages
// ---------------------------------------------------------------------------

router.get("/notifications", (_req, res) => {
  res.json([]);
});

router.post("/notifications/read-all", (_req, res) => {
  res.json({ ok: true });
});

router.post("/notifications/:id/read", (_req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin / ops — restricted to trust staff
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Companion profile management
// ---------------------------------------------------------------------------

type DevCompanionProfile = {
  displayName: string;
  bio: string;
  hourlyRateCents: number;
  activities: string[];
  languages: string[];
  serviceArea: string;
  availableDays: string[];
  availableHoursStart: string;
  availableHoursEnd: string;
  photoUrl?: string | null;
};

const DEFAULT_DEV_PROFILE: DevCompanionProfile = {
  displayName: "Companion",
  bio: "",
  hourlyRateCents: 0,
  activities: [],
  languages: [],
  serviceArea: "",
  availableDays: [],
  availableHoursStart: "10:00",
  availableHoursEnd: "20:00",
  photoUrl: null,
};

/** In-memory store — replaced by Supabase companion_profiles once Task #1 lands */
const devCompanionProfiles = new Map<string, DevCompanionProfile>();

// GET/PUT /companion/profile live in workspace.ts so they persist to companion_profiles.

// ---------------------------------------------------------------------------
// Companion profile photo upload (dev: stores base64 data URL in memory)
// ---------------------------------------------------------------------------

router.post("/companion/profile/photo", async (req, res) => {
  const companionId = await resolveCompanionId(req);
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }

  const { photoDataUrl } = req.body ?? {};
  if (!photoDataUrl || typeof photoDataUrl !== "string") {
    res.status(400).json({ error: "photoDataUrl is required" }); return;
  }
  if (!photoDataUrl.startsWith("data:image/")) {
    res.status(400).json({ error: "Only image files are accepted" }); return;
  }
  // Limit to ~5 MB of base64 (actual bytes ≈ 3.75 MB)
  if (photoDataUrl.length > 5_000_000) {
    res.status(400).json({ error: "Image must be under 5 MB" }); return;
  }

  try {
    await db.update(companionProfiles).set({ photoUrl: photoDataUrl, updatedAt: new Date() }).where(eq(companionProfiles.id, companionId));
    req.log.info({ companionId }, "Companion profile photo updated");
    res.json({ photoUrl: photoDataUrl });
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      const existing = devCompanionProfiles.get(companionId) ?? DEFAULT_DEV_PROFILE;
      const updated = { ...existing, photoUrl: photoDataUrl };
      devCompanionProfiles.set(companionId, updated);
      res.json({ photoUrl: photoDataUrl });
      return;
    }
    req.log.error({ err }, "Photo update failed");
    res.status(503).json({ error: "Could not save photo" });
  }
});

type DevCompanionApplication = {
  id: string; displayName: string; email?: string; city: string; activities: string[];
  languages: string[]; hourlyRate: number; applicationDate: string; bio: string; status: string;
};
const DEV_COMPANION_APPLICATIONS: DevCompanionApplication[] = [];

function formatApplication(row: typeof companionApplications.$inferSelect) {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    city: row.city,
    activities: row.activities,
    languages: row.languages,
    hourlyRate: row.hourlyRate,
    applicationDate: row.createdAt.toISOString().slice(0, 10),
    bio: row.bio,
    status: row.status,
  };
}

router.get("/admin/overview", requireAdmin, async (req, res) => {
  try {
    const [active, queue, open, due] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(bookings)
        .where(inArray(bookings.status, ["deposit_paid", "authorized", "confirmed"])),
      db.select({ count: sql<number>`count(*)` }).from(companionApplications)
        .where(eq(companionApplications.status, "pending")),
      db.select({ count: sql<number>`count(*)` }).from(incidentReports)
        .where(eq(incidentReports.status, "open")),
      db.select({ count: sql<number>`count(*)` }).from(bookings)
        .where(inArray(bookings.status, ["confirmed", "authorized"])),
    ]);
    res.json({
      verificationQueue: Number(queue[0]?.count ?? 0),
      openReports: Number(open[0]?.count ?? 0),
      activeBookings: Number(active[0]?.count ?? 0),
      checkInsDue: Number(due[0]?.count ?? 0),
    });
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json({
        verificationQueue: DEV_COMPANION_APPLICATIONS.length,
        openReports: 0,
        activeBookings: 0,
        checkInsDue: 0,
      });
      return;
    }
    req.log.error({ err }, "Admin overview failed");
    res.status(503).json({ error: "Overview temporarily unavailable" });
  }
});

router.post("/companion/applications", requireAuth, async (req, res) => {
  const { displayName, city, bio, activities, languages, hourlyRate } = req.body as {
    displayName: string; city: string; bio: string;
    activities?: unknown; languages?: unknown; hourlyRate?: unknown;
  };
  if (!displayName || !city || !bio) {
    res.status(400).json({ error: "All fields required" }); return;
  }
  const email = req.user!.email;
  const activityList = Array.isArray(activities)
    ? activities.map((a) => String(a).trim()).filter(Boolean).slice(0, 12)
    : [];
  const languageList = Array.isArray(languages)
    ? languages.map((a) => String(a).trim()).filter(Boolean).slice(0, 8)
    : ["English"];
  const rate = Number.isFinite(Number(hourlyRate))
    ? Math.min(500, Math.max(20, Math.round(Number(hourlyRate))))
    : 60;
  const asDraft = Boolean((req.body as { draft?: boolean })?.draft);
  try {
    const values = {
      accountId: req.user!.id,
      displayName: String(displayName).slice(0, 80),
      email,
      city: String(city).slice(0, 80),
      bio: String(bio).slice(0, 2000),
      activities: activityList,
      languages: languageList.length ? languageList : ["English"],
      hourlyRate: rate,
      status: asDraft ? "draft" : "pending",
    };
    let row;
    if (req.user?.id && asDraft) {
      const [existing] = await db.select().from(companionApplications)
        .where(and(eq(companionApplications.accountId, req.user.id), eq(companionApplications.status, "draft")))
        .limit(1);
      row = existing
        ? (await db.update(companionApplications).set(values).where(eq(companionApplications.id, existing.id)).returning())[0]
        : (await db.insert(companionApplications).values(values).returning())[0];
    } else {
      [row] = await db.insert(companionApplications).values(values).returning();
    }
    req.log.info({ id: row.id }, "Companion application received");
    res.status(201).json({ id: row.id, status: row.status });
  } catch (err: unknown) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      const newApp: DevCompanionApplication = {
        id: `app-${Date.now()}`,
        displayName: String(displayName).slice(0, 80),
        email: String(email).trim().toLowerCase().slice(0, 160),
        city: String(city).slice(0, 80),
        bio: String(bio).slice(0, 2000),
        activities: activityList,
        languages: languageList.length ? languageList : ["English"],
        hourlyRate: rate,
        applicationDate: new Date().toISOString().split("T")[0],
        status: "pending",
      };
      DEV_COMPANION_APPLICATIONS.push(newApp);
      res.status(201).json({ id: newApp.id, status: "pending" });
      return;
    }
    req.log.error({ err }, "Companion application failed");
    res.status(503).json({ error: "Could not submit application" });
  }
});

router.get("/admin/companions/pending", requireAdmin, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(companionApplications)
      .where(eq(companionApplications.status, "pending"))
      .orderBy(desc(companionApplications.createdAt));
    res.json(rows.map(formatApplication));
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json(DEV_COMPANION_APPLICATIONS);
      return;
    }
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Pending companions failed");
    res.status(503).json({ error: "Applications temporarily unavailable" });
  }
});

router.post("/admin/companions/:id/approve", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const actorId = req.user!.id;
  try {
    const [application] = await db
      .select()
      .from(companionApplications)
      .where(eq(companionApplications.id, id));
    if (!application) { res.status(404).json({ error: "Application not found" }); return; }

    let accountId = application.accountId;
    if (!accountId) {
      const [existing] = await db.select().from(accounts).where(eq(accounts.email, application.email)).limit(1);
      if (existing) {
        accountId = existing.id;
      } else {
        const [created] = await db.insert(accounts).values({ email: application.email, displayName: application.displayName }).returning();
        accountId = created.id;
        await db.insert(accountRoles).values({ accountId, role: "customer", grantedBy: actorId });
      }
    }
    const roleRows = await db.select().from(accountRoles)
      .where(eq(accountRoles.accountId, accountId));
    if (!roleRows.some((r) => r.role === "companion")) {
      await db.insert(accountRoles).values({ accountId, role: "companion", grantedBy: actorId });
    }

    const [profile] = await db.insert(companionProfiles).values({
      accountId,
      displayName: application.displayName,
      city: PILOT_CITY,
      serviceArea: isPilotCity(application.city) ? application.city : PILOT_CITY,
      activities: application.activities,
      languages: application.languages,
      hourlyRate: application.hourlyRate,
      biography: application.bio,
      approved: true,
      verified: false,
      identityStatus: "unsubmitted",
    }).returning();

    await db.update(companionApplications).set({
      status: "approved",
      accountId,
      reviewedBy: actorId,
      reviewedAt: new Date(),
    }).where(eq(companionApplications.id, id));

    await writeAudit({
      actorId,
      action: "companion.approve",
      subjectType: "companion_application",
      subjectId: id,
      note: `Approved profile ${profile.id}`,
    });
    res.json({ id, status: "approved", profileId: profile.id });
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json({ id, status: "approved" }); return;
    }
    req.log.error({ err }, "Companion approve failed");
    res.status(503).json({ error: "Could not approve application" });
  }
});

router.post("/admin/companions/:id/reject", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : null;
  try {
    const [application] = await db
      .update(companionApplications)
      .set({
        status: "rejected",
        reviewNote: note,
        reviewedBy: req.user!.id,
        reviewedAt: new Date(),
      })
      .where(eq(companionApplications.id, id))
      .returning();
    if (!application) { res.status(404).json({ error: "Application not found" }); return; }
    await writeAudit({
      actorId: req.user!.id,
      action: "companion.reject",
      subjectType: "companion_application",
      subjectId: id,
      note: note ?? undefined,
    });
    res.json({ id, status: "rejected" });
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json({ id, status: "rejected" }); return;
    }
    req.log.error({ err }, "Companion reject failed");
    res.status(503).json({ error: "Could not reject application" });
  }
});

const IDENTITY_STATUSES = new Set(["unsubmitted", "pending", "verified", "rejected"]);

router.get("/admin/companions/identity", requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(companionProfiles).orderBy(desc(companionProfiles.updatedAt)).limit(80);
    res.json(rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      city: row.city,
      approved: row.approved,
      verified: row.verified,
      identityStatus: row.identityStatus,
      payoutsHeld: row.payoutsHeld,
      accountId: row.accountId,
    })));
  } catch (err) {
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Identity queue failed");
    res.status(503).json({ error: "Identity queue temporarily unavailable" });
  }
});

router.post("/admin/companions/:id/identity", requireAdmin, async (req, res) => {
  const status = String(req.body?.status ?? "");
  if (!IDENTITY_STATUSES.has(status)) {
    res.status(400).json({ error: "Identity status must be unsubmitted, pending, verified, or rejected" }); return;
  }
  try {
    const [row] = await db.update(companionProfiles).set({
      identityStatus: status,
      verified: status === "verified",
      updatedAt: new Date(),
    }).where(eq(companionProfiles.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Companion not found" }); return; }
    await writeAudit({
      actorId: req.user!.id,
      action: "companion.identity",
      subjectType: "companion_profile",
      subjectId: row.id,
      note: status,
    });
    res.json({ id: row.id, identityStatus: row.identityStatus, verified: row.verified });
  } catch (err) {
    req.log.error({ err }, "Identity update failed");
    res.status(503).json({ error: "Could not update identity status" });
  }
});

router.post("/companion/identity/submit", async (req, res) => {
  const profile = await resolveCompanionProfile(req);
  if (!profile) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [row] = await db.update(companionProfiles).set({
      identityStatus: "pending",
      updatedAt: new Date(),
    }).where(eq(companionProfiles.id, profile.id)).returning();
    res.json({ identityStatus: row?.identityStatus ?? "pending" });
  } catch (err) {
    req.log.error({ err }, "Identity submit failed");
    res.status(503).json({ error: "Could not submit identity for review" });
  }
});

router.post("/admin/companions/:id/payouts-hold", requireAdmin, async (req, res) => {
  const held = req.body?.held !== false;
  try {
    const [row] = await db.update(companionProfiles).set({
      payoutsHeld: held,
      updatedAt: new Date(),
    }).where(eq(companionProfiles.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Companion not found" }); return; }
    await writeAudit({
      actorId: req.user!.id,
      action: held ? "companion.payouts_hold" : "companion.payouts_release",
      subjectType: "companion_profile",
      subjectId: row.id,
    });
    res.json({ id: row.id, payoutsHeld: row.payoutsHeld });
  } catch (err) {
    req.log.error({ err }, "Companion payout hold failed");
    res.status(503).json({ error: "Could not update payout hold" });
  }
});

router.post("/admin/bookings/:id/payout-hold", requireAdmin, async (req, res) => {
  const held = req.body?.held !== false;
  try {
    const [row] = await db.update(bookings).set({
      payoutHeld: held,
      updatedAt: new Date(),
    }).where(eq(bookings.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "Booking not found" }); return; }
    await writeAudit({
      actorId: req.user!.id,
      action: held ? "booking.payout_hold" : "booking.payout_release",
      subjectType: "booking",
      subjectId: row.id,
    });
    res.json({ id: row.id, payoutHeld: row.payoutHeld });
  } catch (err) {
    req.log.error({ err }, "Booking payout hold failed");
    res.status(503).json({ error: "Could not update payout hold" });
  }
});

router.post("/admin/bookings/:id/refund", requireAdmin, async (req, res) => {
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, req.params.id)).limit(1);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    await refundOrCancelIntent(booking.depositPaymentIntentId);
    await refundOrCancelIntent(booking.fullPaymentIntentId);
    const [updated] = await db.update(bookings).set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(bookings.id, booking.id)).returning();
    await recordBookingEvent({
      bookingId: booking.id,
      fromStatus: booking.status,
      toStatus: "cancelled",
      actorId: req.user!.id,
      note: "admin_refund",
    });
    await writeAudit({
      actorId: req.user!.id,
      action: "booking.refund",
      subjectType: "booking",
      subjectId: booking.id,
    });
    res.json(formatBookingFull(updated));
  } catch (err) {
    req.log.error({ err }, "Admin refund failed");
    res.status(503).json({ error: "Could not refund this booking. Check Stripe and try again." });
  }
});

router.post("/admin/bookings/:id/no-show", requireAdmin, async (req, res) => {
  const party = req.body?.party === "companion" ? "companion" : "customer";
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, req.params.id)).limit(1);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (party === "companion") {
      await refundOrCancelIntent(booking.depositPaymentIntentId);
      await refundOrCancelIntent(booking.fullPaymentIntentId);
    } else {
      await refundOrCancelIntent(booking.fullPaymentIntentId, Math.max(0, booking.totalCents - booking.depositCents));
    }
    const [updated] = await db.update(bookings).set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(bookings.id, booking.id)).returning();
    await recordBookingEvent({
      bookingId: booking.id,
      fromStatus: booking.status,
      toStatus: "cancelled",
      actorId: req.user!.id,
      note: `no_show_${party}`,
    });
    await writeAudit({
      actorId: req.user!.id,
      action: "booking.no_show",
      subjectType: "booking",
      subjectId: booking.id,
      note: party,
    });
    res.json(formatBookingFull(updated));
  } catch (err) {
    req.log.error({ err }, "No-show handling failed");
    res.status(503).json({ error: "Could not record no-show" });
  }
});

router.post("/admin/bookings/:id/capture", requireAdmin, async (req, res) => {
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, req.params.id)).limit(1);
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    const [profile] = await db.select().from(companionProfiles).where(eq(companionProfiles.id, booking.companionId)).limit(1);
    const captured = await captureIntentIfHeld(booking.fullPaymentIntentId);
    if (!captured.ok && captured.detail !== "already_captured") {
      res.status(503).json({ error: "Could not capture payment." }); return;
    }
    const holdPayout = Boolean(booking.payoutHeld || profile?.payoutsHeld);
    let transferId = booking.stripeTransferId ?? null;
    const companionAccountId = profile?.stripeAccountId ?? devCompanionStripeAccounts.get(booking.companionId);
    if (!holdPayout && companionAccountId && !transferId) {
      const transferred = await transferCompanionPayout({
        bookingId: booking.id,
        amountCents: booking.companionPayoutCents,
        destinationAccountId: companionAccountId,
        existingTransferId: booking.stripeTransferId,
      });
      if (transferred.ok && transferred.transferId) {
        transferId = transferred.transferId;
        await db.update(bookings).set({ stripeTransferId: transferId, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      }
    }
    await writeAudit({
      actorId: req.user!.id,
      action: "booking.capture",
      subjectType: "booking",
      subjectId: booking.id,
      note: holdPayout ? `${captured.detail};payout_held` : captured.detail,
    });
    res.json({ id: booking.id, captured: captured.detail, payoutHeld: holdPayout, transferId });
  } catch (err) {
    req.log.error({ err }, "Admin capture failed");
    res.status(503).json({ error: "Could not capture payment" });
  }
});

router.get("/admin/bookings/recent", requireAdmin, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(bookings)
      .orderBy(desc(bookings.createdAt))
      .limit(20);
    res.json(rows.map(formatBookingFull));
  } catch (err: unknown) {
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Admin bookings failed");
    res.status(503).json({ error: "Bookings temporarily unavailable" });
  }
});

router.get("/admin/reports", requireAdmin, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(incidentReports)
      .orderBy(desc(incidentReports.createdAt))
      .limit(50);
    res.json(rows);
  } catch (err) {
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Admin reports failed");
    res.status(503).json({ error: "Reports temporarily unavailable" });
  }
});

router.get("/admin/bookings/:id/messages", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await db.select().from(messages).where(eq(messages.bookingId, id));
    await writeAudit({
      actorId: req.user!.id,
      action: "messages.review",
      subjectType: "booking",
      subjectId: id,
      note: "reported_thread",
    });
    res.json(rows.map((row) => ({
      id: row.id,
      senderRole: row.senderRole,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    })));
  } catch (err) {
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Admin message review failed");
    res.status(503).json({ error: "Could not load the reported thread" });
  }
});

router.post("/admin/reports/:id/resolve", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : null;
  const riskLevel = typeof req.body?.riskLevel === "string" ? req.body.riskLevel : undefined;
  try {
    const [row] = await db.update(incidentReports).set({
      status: "resolved",
      resolutionNote: note,
      resolvedBy: req.user!.id,
      resolvedAt: new Date(),
      ...(riskLevel ? { riskLevel } : {}),
    }).where(eq(incidentReports.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Report not found" }); return; }
    await writeAudit({
      actorId: req.user!.id,
      action: "report.resolve",
      subjectType: "incident_report",
      subjectId: id,
      note: note ?? undefined,
    });
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Resolve report failed");
    res.status(503).json({ error: "Could not resolve report" });
  }
});

router.post("/admin/accounts/:id/suspend", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : "Suspended by trust team";
  try {
    const [row] = await db.update(accounts).set({
      suspendedAt: new Date(),
      suspensionReason: reason,
      updatedAt: new Date(),
    }).where(eq(accounts.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Account not found" }); return; }
    await db.update(companionProfiles).set({ paused: true, updatedAt: new Date() }).where(eq(companionProfiles.accountId, id));
    await revokeAllSessions(id);
    await writeAudit({
      actorId: req.user!.id,
      action: "account.suspend",
      subjectType: "account",
      subjectId: id,
      note: reason,
    });
    res.json({ id, status: "suspended" });
  } catch (err) {
    req.log.error({ err }, "Suspend account failed");
    res.status(503).json({ error: "Could not suspend account" });
  }
});

router.post("/admin/accounts/:id/ban", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : "Banned by trust team";
  try {
    const [row] = await db.update(accounts).set({
      bannedAt: new Date(),
      suspendedAt: new Date(),
      suspensionReason: reason,
      updatedAt: new Date(),
    }).where(eq(accounts.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Account not found" }); return; }
    await db.update(companionProfiles).set({ paused: true, approved: false, updatedAt: new Date() }).where(eq(companionProfiles.accountId, id));
    await revokeAllSessions(id);
    await writeAudit({
      actorId: req.user!.id,
      action: "account.ban",
      subjectType: "account",
      subjectId: id,
      note: reason,
    });
    res.json({ id, status: "banned" });
  } catch (err) {
    req.log.error({ err }, "Ban account failed");
    res.status(503).json({ error: "Could not ban account" });
  }
});

router.post("/admin/accounts/:id/restore", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [row] = await db.update(accounts).set({
      suspendedAt: null,
      bannedAt: null,
      deactivatedAt: null,
      suspensionReason: null,
      updatedAt: new Date(),
    }).where(eq(accounts.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Account not found" }); return; }
    await writeAudit({
      actorId: req.user!.id,
      action: "account.restore",
      subjectType: "account",
      subjectId: id,
    });
    res.json({ id, status: "active" });
  } catch (err) {
    req.log.error({ err }, "Restore account failed");
    res.status(503).json({ error: "Could not restore account" });
  }
});

router.get("/admin/audit", requireAdmin, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(100);
    res.json(rows);
  } catch (err) {
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Audit log failed");
    res.status(503).json({ error: "Audit log temporarily unavailable" });
  }
});

// ---------------------------------------------------------------------------
// Safety — public
// ---------------------------------------------------------------------------

router.get("/safety", (_req, res) => {
  const data = GetSafetyResourcesResponse.parse({
    title: "Your safety comes first",
    emergencyGuidance:
      "If you are in immediate danger, contact local emergency services. OnlyFavors is not an emergency response service.",
    principles: [
      "Meet in a public SafeSpot and keep your own transportation plan.",
      "Share a timed safety plan with someone you trust.",
      "Keep payments and messages on OnlyFavors.",
      "Respect stated boundaries and report concerns early.",
    ],
  });
  res.json(data);
});

// In-memory SafeSpot applications (pending venue approvals)
// In-memory SafeSpot applications (pending venue approvals)
type SafeSpotApplication = {
  id: string; name: string; address: string; city: string; type: string;
  contactEmail: string; contactName: string; description: string;
  submittedAt: string; status: 'pending' | 'approved' | 'rejected';
};
const devSafeSpotApplications: SafeSpotApplication[] = [];

router.post("/safespots/register", async (req, res) => {
  const { name, address, city, type, contactEmail, contactName, description } = req.body ?? {};
  if (!name || !address || !city || !contactEmail) {
    res.status(400).json({ error: "name, address, city, and contactEmail are required" }); return;
  }
  try {
    const [row] = await db.insert(safespotApplications).values({
      name: String(name).trim().slice(0, 120),
      address: String(address).trim().slice(0, 200),
      city: String(city).trim().slice(0, 80),
      type: String(type ?? "other").trim().slice(0, 40),
      contactEmail: String(contactEmail).trim().slice(0, 160),
      contactName: String(contactName ?? "").trim().slice(0, 80),
      description: String(description ?? "").slice(0, 500).trim(),
    }).returning();
    req.log.info({ id: row.id }, "SafeSpot application submitted");
    res.status(201).json({ id: row.id, status: row.status });
  } catch (err: unknown) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      const app: SafeSpotApplication = {
        id: `ss-app-${crypto.randomUUID().slice(0, 8)}`,
        name: String(name).trim(),
        address: String(address).trim(),
        city: String(city).trim(),
        type: String(type ?? "other").trim(),
        contactEmail: String(contactEmail).trim(),
        contactName: String(contactName ?? "").trim(),
        description: String(description ?? "").slice(0, 500).trim(),
        submittedAt: new Date().toISOString(),
        status: "pending",
      };
      devSafeSpotApplications.push(app);
      res.status(201).json({ id: app.id, status: "pending" });
      return;
    }
    req.log.error({ err }, "SafeSpot application failed");
    res.status(503).json({ error: "Could not submit venue" });
  }
});

router.get("/admin/safespots/pending", requireAdmin, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(safespotApplications)
      .where(eq(safespotApplications.status, "pending"))
      .orderBy(desc(safespotApplications.createdAt));
    res.json(rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      city: row.city,
      type: row.type,
      contactEmail: row.contactEmail,
      contactName: row.contactName,
      submittedAt: row.createdAt.toISOString(),
      status: row.status,
    })));
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json(devSafeSpotApplications.filter((a) => a.status === "pending"));
      return;
    }
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "SafeSpot pending failed");
    res.status(503).json({ error: "Venue applications temporarily unavailable" });
  }
});

router.post("/admin/safespots/:id/approve", requireAdmin, async (req, res) => {
  try {
    const [app] = await db.select().from(safespotApplications).where(eq(safespotApplications.id, req.params.id));
    if (!app) { res.status(404).json({ error: "Application not found" }); return; }
    await db.update(safespotApplications).set({ status: "approved" }).where(eq(safespotApplications.id, app.id));
    await db.insert(safespots).values({
      name: app.name,
      category: app.type,
      city: app.city,
      addressHint: app.address,
      openLate: false,
      active: true,
    });
    await writeAudit({
      actorId: req.user!.id,
      action: "safespot.approve",
      subjectType: "safespot_application",
      subjectId: app.id,
    });
    res.json({ ...app, status: "approved" });
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      const app = devSafeSpotApplications.find((a) => a.id === req.params.id);
      if (!app) { res.status(404).json({ error: "Application not found" }); return; }
      app.status = "approved";
      res.json(app);
      return;
    }
    req.log.error({ err }, "SafeSpot approve failed");
    res.status(503).json({ error: "Could not approve venue" });
  }
});

router.post("/admin/safespots/:id/reject", requireAdmin, async (req, res) => {
  try {
    const [app] = await db.update(safespotApplications)
      .set({ status: "rejected" })
      .where(eq(safespotApplications.id, req.params.id))
      .returning();
    if (!app) { res.status(404).json({ error: "Application not found" }); return; }
    await writeAudit({
      actorId: req.user!.id,
      action: "safespot.reject",
      subjectType: "safespot_application",
      subjectId: app.id,
    });
    res.json(app);
  } catch (err) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      const app = devSafeSpotApplications.find((a) => a.id === req.params.id);
      if (!app) { res.status(404).json({ error: "Application not found" }); return; }
      app.status = "rejected";
      res.json(app);
      return;
    }
    req.log.error({ err }, "SafeSpot reject failed");
    res.status(503).json({ error: "Could not reject venue" });
  }
});

router.get("/safespots", async (req, res) => {
  const query = ListSafeSpotsQueryParams.parse(req.query);
  if (query.city && !isPilotCity(query.city)) {
    res.json([]);
    return;
  }
  try {
    const rows = await getSafeSpots(query.city || PILOT_CITY);
    res.json(
      rows
        .filter((row) => isPilotCity(row.city))
        .map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        city: row.city,
        cityLabel: row.city, // Populated by real schema; clients fall back to city code
        addressHint: row.address_hint,
        openLate: row.open_late,
      })),
    );
  } catch (err) {
    if (isMissingTableError(err) || process.env.NODE_ENV === "development") {
      req.log.warn({ err }, "SafeSpot directory unavailable — returning empty list");
      res.json([]);
      return;
    }
    req.log.error({ err }, "Unable to read SafeSpots");
    res.status(503).json({ error: "SafeSpots are temporarily unavailable" });
  }
});

router.get("/safespots/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await getSafeSpot(id);
    if (!rows.length) {
      res.status(404).json({ error: "SafeSpot not found" }); return;
    }
    const row = rows[0];
    if (!isPilotCity(row.city)) {
      res.status(404).json({ error: "SafeSpot not found" }); return;
    }
    res.json({
      id: row.id,
      name: row.name,
      category: row.category,
      city: row.city,
      addressHint: row.address_hint,
      openLate: row.open_late,
    });
  } catch (err) {
    req.log.error({ err }, "Unable to read SafeSpot");
    res.status(503).json({ error: "SafeSpot temporarily unavailable" });
  }
});

// ---------------------------------------------------------------------------
// Companion payout setup — Stripe Connect Express onboarding
// ---------------------------------------------------------------------------

router.post("/companion/stripe/onboard", async (req, res) => {
  const profile = await resolveCompanionProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const companionId = profile.id;

  try {
    const stripe = await getUncachableStripeClient();

    let accountId = profile.stripeAccountId ?? devCompanionStripeAccounts.get(companionId);
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        metadata: { companionId },
        capabilities: { transfers: { requested: true } },
      });
      accountId = account.id;
      try {
        await db.update(companionProfiles).set({ stripeAccountId: accountId, updatedAt: new Date() }).where(eq(companionProfiles.id, companionId));
      } catch (err) {
        if (!isMissingTableError(err)) throw err;
        devCompanionStripeAccounts.set(companionId, accountId);
      }
    }

    // Build return/refresh URLs from the incoming request origin
    const origin =
      (req.headers["x-forwarded-proto"] ?? "https") +
      "://" +
      (req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost");
    const base = `${origin}${process.env.FRONTEND_BASE_PATH ?? "/onlyfavors"}`;
    const returnUrl = `${base}/dashboard/companion?stripe=return`;
    const refreshUrl = `${base}/dashboard/companion?stripe=refresh`;

    const link = await stripe.accountLinks.create({
      account: accountId,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: "account_onboarding",
    });

    req.log.info({ companionId, accountId }, "Stripe Connect onboarding link created");
    res.json({ url: link.url });
  } catch (err) {
    req.log.error({ err }, "Unable to create Stripe Connect onboarding link");
    res.status(503).json({ error: "Payout setup is not available until Stripe is connected" });
  }
});

router.get("/companion/stripe/status", async (req, res) => {
  const profile = await resolveCompanionProfile(req);
  if (!profile) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const companionId = profile.id;

  try {
    const accountId = profile.stripeAccountId ?? devCompanionStripeAccounts.get(companionId);
    if (!accountId) {
      res.json({ status: "not_started" });
      return;
    }

    const stripe = await getUncachableStripeClient();
    const account = await stripe.accounts.retrieve(accountId);

    const active =
      account.details_submitted &&
      (account.charges_enabled || account.payouts_enabled);

    req.log.info({ companionId, accountId, active }, "Stripe Connect status checked");
    res.json({
      status: active ? "active" : "pending",
      accountId,
      detailsSubmitted: account.details_submitted,
      payoutsEnabled: account.payouts_enabled ?? false,
    });
  } catch (err) {
    req.log.error({ err }, "Unable to retrieve Stripe Connect account status");
    res.status(503).json({ error: "Unable to check payout status" });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function publicCompanionExtras(companionId: string) {
  let availability: Array<{ day: string; hours: string }> = [];
  let availabilityHint: "now" | "tonight" | "weekend" | null = null;
  try {
    const windows = await db.select().from(availabilityWindows).where(eq(availabilityWindows.companionId, companionId));
    availability = windowsToPublic(windows);
    availabilityHint = windowsHint(windows);
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }
  let paused = false;
  let away: { enabled: boolean; returnDate: string; note: string } | undefined;
  let memberSince: string | undefined;
  let totalBookings = 0;
  let approvedAreas: string[] = [];
  try {
    const rows = await db.select().from(serviceAreas).where(eq(serviceAreas.companionId, companionId));
    approvedAreas = rows.map((row) => row.label).filter(Boolean);
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }
  try {
    const [row] = await db.select().from(companionProfiles).where(eq(companionProfiles.id, companionId)).limit(1);
    if (row) {
      paused = row.paused;
      memberSince = row.createdAt.toLocaleString("en-US", { month: "short", year: "numeric" });
      const prefs = mergeWorkspacePrefs(row.workspacePrefs);
      if (prefs.away.enabled) {
        away = { enabled: true, returnDate: prefs.away.returnDate, note: prefs.away.note };
      }
    }
    const completed = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.companionId, companionId), eq(bookings.status, "completed")));
    totalBookings = completed.length;
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
  }
  return { availability, availabilityHint, approvedAreas, paused, away, memberSince, totalBookings };
}

function mapCompanionRow(
  row: {
    id: string;
    display_name: string;
    city: string;
    service_area: string;
    activities: string[];
    languages: string[];
    hourly_rate: number;
    day_rate?: number | null;
    response_time: string;
    rating: number;
    review_count: number;
    verified: boolean;
    instant_book: boolean;
    biography?: string | null;
    boundaries?: string[];
    interview_answers?: string[];
    photo_url?: string | null;
    available_today?: boolean;
    identity_status?: string;
    created_at?: string;
  },
  availabilityHint: "now" | "tonight" | "weekend" | null = null,
  approvedAreas: string[] = [],
) {
  const identityVerified = row.identity_status === "verified";
  const responseTime =
    row.response_time && row.response_time !== "Usually within a day" ? row.response_time : "";
  const areas = approvedAreas.length ? approvedAreas : row.service_area ? [row.service_area] : [];
  return {
    id: row.id,
    displayName: publicFirstName(row.display_name),
    city: row.city,
    serviceArea: areas[0] ?? row.service_area,
    approvedAreas: areas,
    activities: row.activities,
    languages: row.languages,
    hourlyRate: row.hourly_rate,
    dayRate: row.day_rate ?? null,
    responseTime,
    rating: row.rating,
    reviewCount: row.review_count,
    verified: identityVerified,
    identityVerified,
    instantBook: row.instant_book,
    biography: row.biography ?? null,
    boundaries: row.boundaries ?? [],
    interviewAnswers: (row.interview_answers ?? []).filter(Boolean).slice(0, 3),
    photoUrl: row.photo_url ?? null,
    availableNow: availabilityHint === "now",
    availabilityHint,
    createdAt: row.created_at ?? undefined,
  };
}

async function withReviewedFlag<T extends { id: string }>(rows: T[]): Promise<Array<T & { reviewed: boolean }>> {
  if (rows.length === 0) return [];
  try {
    const found = await db
      .select({ bookingId: reviewRows.bookingId })
      .from(reviewRows)
      .where(inArray(reviewRows.bookingId, rows.map((row) => row.id)));
    const reviewedIds = new Set(found.map((row) => row.bookingId));
    return rows.map((row) => ({ ...row, reviewed: reviewedIds.has(row.id) }));
  } catch {
    return rows.map((row) => ({ ...row, reviewed: false }));
  }
}

function formatBookingFull(b: {
  id: string;
  status: string;
  customerId: string;
  companionId: string;
  activity: string;
  date: string;
  startTime: string;
  durationHours: string;
  safeSpotId: string | null;
  subtotalCents: number;
  customerFeeCents: number;
  totalCents: number;
  companionPayoutCents: number;
  platformRevenueCents: number;
  depositCents: number;
  depositPaidAt: Date | null;
  confirmedAt: Date | null;
  authorizedAt: Date | null;
  payoutHeld?: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: b.id,
    status: b.status,
    companionId: b.companionId,
    activity: b.activity,
    date: b.date,
    startTime: b.startTime,
    durationHours: Number(b.durationHours),
    safeSpotId: b.safeSpotId,
    subtotalCents: b.subtotalCents,
    customerFeeCents: b.customerFeeCents,
    totalCents: b.totalCents,
    companionPayoutCents: b.companionPayoutCents,
    platformRevenueCents: b.platformRevenueCents,
    depositCents: b.depositCents,
    depositPaidAt: b.depositPaidAt?.toISOString() ?? null,
    confirmedAt: b.confirmedAt?.toISOString() ?? null,
    authorizedAt: b.authorizedAt?.toISOString() ?? null,
    payoutHeld: Boolean(b.payoutHeld),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

function formatBooking(b: {
  id: string;
  status: string;
  subtotalCents: number;
  customerFeeCents: number;
  totalCents: number;
  companionPayoutCents: number;
  platformRevenueCents: number;
  depositCents: number;
  depositPaymentIntentId: string | null;
  fullPaymentIntentId: string | null;
}) {
  return {
    id: b.id,
    status: b.status,
    subtotalCents: b.subtotalCents,
    customerFeeCents: b.customerFeeCents,
    totalCents: b.totalCents,
    companionPayoutCents: b.companionPayoutCents,
    platformRevenueCents: b.platformRevenueCents,
    depositCents: b.depositCents,
    depositCreditedToFinal: true,
    // Never expose PI IDs to the response — return them only from deposit/authorize routes
    stripePaymentIntentId: null,
  };
}

// ---------------------------------------------------------------------------
// Platform announcement (admin-set, shown on home page)
// ---------------------------------------------------------------------------
router.get("/stats", async (_req, res) => {
  try {
    const [companions, completed] = await Promise.all([
      db.select({
        id: companionProfiles.id,
        city: companionProfiles.city,
        rating: companionProfiles.rating,
        reviewCount: companionProfiles.reviewCount,
      }).from(companionProfiles).where(and(eq(companionProfiles.approved, true), eq(companionProfiles.paused, false))),
      db.select({ id: bookings.id }).from(bookings).where(eq(bookings.status, "completed")),
    ]);
    const rated = companions.filter((row) => Number(row.reviewCount) > 0);
    const averageRating = rated.length
      ? Math.round((rated.reduce((sum, row) => sum + Number(row.rating), 0) / rated.length) * 100) / 100
      : 0;
    const cities = new Set(companions.map((row) => row.city).filter(Boolean));
    res.json({
      companionCount: companions.length,
      completedBookings: completed.length,
      averageRating,
      cityCount: cities.size,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      res.json({ companionCount: 0, completedBookings: 0, averageRating: 0, cityCount: 0 });
      return;
    }
    req.log.error({ err }, "Public stats failed");
    res.json({ companionCount: 0, completedBookings: 0, averageRating: 0, cityCount: 0 });
  }
});

router.get("/announcement", async (_req, res) => {
  try {
    const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, "default")).limit(1);
    res.json({
      message: row?.announcementMessage ?? "",
      kind: row?.announcementKind ?? "info",
      active: row?.announcementActive ?? false,
      accessFeeEnabled: row?.accessFeeEnabled ?? false,
      accessFeeCents: row?.accessFeeCents ?? 0,
      accessFeeLabel: row?.accessFeeLabel ?? "Messaging access",
    });
  } catch {
    res.json({ message: "", kind: "info", active: false, accessFeeEnabled: false, accessFeeCents: 0 });
  }
});

router.post("/admin/announcement", requireAdmin, async (req, res) => {
  const { message, kind, active } = req.body ?? {};
  const announcement = {
    announcementMessage: String(message ?? "").slice(0, 200),
    announcementKind: ["info", "warning", "success"].includes(kind) ? kind : "info",
    announcementActive: Boolean(active),
    updatedAt: new Date(),
  };
  try {
    await db
      .insert(platformSettings)
      .values({ id: "default", ...announcement })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: announcement,
      });
    await writeAudit({
      actorId: req.user!.id,
      action: active ? "announcement.publish" : "announcement.clear",
      subjectType: "platform_settings",
      subjectId: "default",
      note: announcement.announcementMessage || undefined,
    });
    res.json({
      ok: true,
      announcement: {
        message: announcement.announcementMessage,
        kind: announcement.announcementKind,
        active: announcement.announcementActive,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Announcement update failed");
    res.status(503).json({ error: "Could not update announcement" });
  }
});

// ---------------------------------------------------------------------------
// Platform health summary  GET /platform/health
// ---------------------------------------------------------------------------
router.get('/platform/health', async (_req, res) => {
  try {
    const [bookingRows, msgRows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(bookings),
      db.select({ count: sql<number>`count(*)` }).from(messages),
    ]);
    const bookingCount = Number(bookingRows[0]?.count ?? 0);
    const messageCount = Number(msgRows[0]?.count ?? 0);
    res.json({
      ok: true,
      bookings: bookingCount,
      messages: messageCount,
      uptime: process.uptime(),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      res.json({
        ok: true,
        bookings: 0,
        messages: 0,
        uptime: process.uptime(),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        timestamp: new Date().toISOString(),
        dev: true,
      });
    } else {
      res.status(500).json({ ok: false, error: 'Health check failed' });
    }
  }
});

// ---------------------------------------------------------------------------
// Platform analytics summary  GET /platform/analytics
// ---------------------------------------------------------------------------
router.get('/platform/analytics', requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(bookings).orderBy(desc(bookings.createdAt));

    const statusCounts: Record<string, number> = {};
    let revenueCents = 0;
    let companionPayoutCents = 0;
    const dailyCounts: Record<string, number> = {};

    for (const b of rows) {
      statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1;
      if (b.status === 'completed') {
        revenueCents += b.platformRevenueCents;
        companionPayoutCents += b.companionPayoutCents;
      }
      const day = b.createdAt.toISOString().slice(0, 10);
      dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
    }

    const last30Days = Object.entries(dailyCounts)
      .filter(([d]) => d >= new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    res.json({
      ok: true,
      total: rows.length,
      byStatus: statusCounts,
      revenueCents,
      companionPayoutCents,
      platformGrossMarginPct: revenueCents + companionPayoutCents > 0
        ? Math.round(revenueCents / (revenueCents + companionPayoutCents) * 100)
        : null,
      last30Days,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      res.json({
        ok: true,
        total: 0,
        byStatus: {},
        revenueCents: 0,
        companionPayoutCents: 0,
        platformGrossMarginPct: null,
        last30Days: [],
        dev: true,
      });
    } else {
      res.status(500).json({ ok: false, error: 'Analytics query failed' });
    }
  }
});

// ---------------------------------------------------------------------------
// Booking search by customer or companion  GET /bookings/search
// ---------------------------------------------------------------------------
router.get('/bookings/search', requireAdmin, async (req, res) => {
  const { q, status, limit } = req.query as Record<string, string | undefined>;
  const lim = Math.min(Number(limit ?? 50), 200);
  try {
    const rows = await db.select().from(bookings)
      .orderBy(desc(bookings.createdAt))
      .limit(lim);

    let filtered = rows;
    if (q) {
      const term = q.toLowerCase();
      filtered = filtered.filter(
        (b) => b.id.includes(term) || b.customerId.includes(term) || b.companionId.includes(term)
      );
    }
    if (status) {
      filtered = filtered.filter((b) => b.status === status);
    }

    res.json({ ok: true, bookings: filtered.map((b) => ({
      id: b.id,
      status: b.status,
      customerId: b.customerId,
      companionId: b.companionId,
      date: b.date,
      totalCents: b.totalCents,
      createdAt: b.createdAt.toISOString(),
    })) });
  } catch (err) {
    if (isMissingTableError(err)) {
      res.json({ ok: true, bookings: [], dev: true });
    } else {
      res.status(500).json({ ok: false, error: 'Search failed' });
    }
  }
});

export default router;
