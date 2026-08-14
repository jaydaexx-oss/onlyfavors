import { Router, type IRouter } from "express";
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
  accountRoles,
  accounts,
  adminAuditLog,
  checkIns,
  companionApplications,
  companionProfiles,
  incidentReports,
  platformSettings,
  reviews as reviewRows,
  safespotApplications,
  safespots,
} from "@workspace/db/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  getApprovedCompanion,
  getApprovedCompanions,
  getSafeSpot,
  getSafeSpots,
} from "../lib/supabase";
import { calculatePrice } from "../lib/pricing";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { getActorId, requireAdmin, writeAudit } from "../lib/auth";

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

// ---------------------------------------------------------------------------
// In-memory Stripe Connect account store (dev-only)
// Replace with Supabase companion_profiles.stripe_account_id once Task #1 lands
// ---------------------------------------------------------------------------
const devCompanionStripeAccounts = new Map<string, string>(); // companionId → stripeAccountId

// ---------------------------------------------------------------------------
// Discovery — public, privacy-safe
// ---------------------------------------------------------------------------

router.get("/companions", async (req, res) => {
  const query = ListCompanionsQueryParams.parse(req.query);
  try {
    const rows = await getApprovedCompanions();
    const companions = rows
      .filter((row) => {
        if (
          query.city &&
          !row.city.toLowerCase().includes(query.city.toLowerCase())
        )
          return false;
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
        return true;
      })
      .map((row) => mapCompanionRow(row));
    req.log.info({ count: companions.length }, "Listed approved companions");
    res.json(companions);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      req.log.warn({ err }, "Supabase unavailable — serving companion dev fixtures");
      const fixtures = Object.values(DEV_COMPANIONS) as any[];
      const filtered = fixtures.filter((c) => {
        if (query.city && !c.serviceArea?.toLowerCase().includes(query.city.toLowerCase()) && !c.city?.toLowerCase().includes(query.city.toLowerCase())) return false;
        if (query.activity && !c.activities?.some((a: string) => a.toLowerCase().includes(query.activity!.toLowerCase()))) return false;
        if (query.language && !c.languages?.includes(query.language)) return false;
        if (query.maxRate !== undefined && c.hourlyRate > query.maxRate) return false;
        return true;
      });
      res.json(filtered.map((c: any) => ({ ...c, availableNow: availableTodaySet.has(c.id) }))); return;
    }
    req.log.error({ err }, "Unable to read approved companions");
    res.status(503).json({ error: "Companion directory is temporarily unavailable" });
  }
});

// In-memory set of companions who have paused new booking requests
const pausedRequestsSet = new Set<string>();

router.get("/companion/requests/paused", (req, res) => {
  const companionId =
    getActorId(req, "companion");
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  res.json({ paused: pausedRequestsSet.has(companionId) });
});

router.post("/companion/requests/pause", (req, res) => {
  const companionId =
    getActorId(req, "companion");
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { paused } = req.body ?? {};
  if (paused) {
    pausedRequestsSet.add(companionId);
  } else {
    pausedRequestsSet.delete(companionId);
  }
  req.log.info({ companionId, paused }, "Companion request pause updated");
  res.json({ paused: pausedRequestsSet.has(companionId) });
});

// In-memory set of companions who have marked themselves "available today"
const availableTodaySet = new Set<string>(['companion-maya']); // Maya available by default for demo

router.get("/companion/availability/today", (req, res) => {
  const companionId =
    getActorId(req, "companion");
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  res.json({ available: availableTodaySet.has(companionId) });
});

router.post("/companion/availability/today", (req, res) => {
  const companionId =
    getActorId(req, "companion");
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  const { available } = req.body ?? {};
  if (available) {
    availableTodaySet.add(companionId);
  } else {
    availableTodaySet.delete(companionId);
  }
  req.log.info({ companionId, available }, "Companion availability updated");
  res.json({ available: availableTodaySet.has(companionId) });
});

/** Dev companion fixtures — shown when Supabase is unavailable */
export const DEV_BOOKING_FIXTURES: Record<string, object> = {
  "dev-booking-1": {
    id: "dev-booking-1", status: "confirmed", companionId: "companion-maya",
    customerId: "dev-preview-customer", activity: "Museum visits",
    date: "2026-08-20", startTime: "10:00", durationHours: 2,
    safeSpotId: "ss-sf-1",
    subtotalCents: 13000, customerFeeCents: 650, companionCommissionCents: 1950,
    companionPayoutCents: 11050, totalCents: 13650, depositCents: 1000,
    depositPaidAt: "2026-08-13T18:30:00Z", confirmedAt: "2026-08-13T19:05:00Z", authorizedAt: null,
    cancelledAt: null, cancellationReason: null,
  },
  "dev-booking-2": {
    id: "dev-booking-2", status: "requested", companionId: "companion-jordan",
    customerId: "dev-preview-customer", activity: "Gallery tours",
    date: "2026-08-22", startTime: "14:00", durationHours: 3,
    safeSpotId: "ss-ny-1",
    subtotalCents: 22500, customerFeeCents: 1125, companionCommissionCents: 3375,
    companionPayoutCents: 19125, totalCents: 23625, depositCents: 1000,
    depositPaidAt: null, confirmedAt: null, authorizedAt: null,
    cancelledAt: null, cancellationReason: null,
  },
  "dev-booking-3": {
    id: "dev-booking-3", status: "completed", companionId: "companion-maya",
    customerId: "dev-preview-customer", activity: "Coffee conversations",
    date: "2026-08-10", startTime: "09:00", durationHours: 1,
    safeSpotId: "ss-sf-2",
    subtotalCents: 6500, customerFeeCents: 325, companionCommissionCents: 975,
    companionPayoutCents: 5525, totalCents: 6825, depositCents: 1000,
    depositPaidAt: "2026-08-09T14:00:00Z", confirmedAt: "2026-08-09T14:30:00Z", authorizedAt: "2026-08-09T14:31:00Z",
    cancelledAt: null, cancellationReason: null,
  },
  // Pending request for Maya — lets the companion accept/decline flow be tested
  "dev-booking-4": {
    id: "dev-booking-4", status: "requested", companionId: "companion-maya",
    customerId: "dev-preview-customer", activity: "Walk and conversation",
    date: "2026-08-25", startTime: "11:00", durationHours: 2,
    safeSpotId: "ss-sf-3",
    subtotalCents: 13000, customerFeeCents: 650, companionCommissionCents: 1950,
    companionPayoutCents: 11050, totalCents: 13650, depositCents: 1000,
    depositPaidAt: null, confirmedAt: null, authorizedAt: null,
    cancelledAt: null, cancellationReason: null,
  },
};

const DEV_COMPANIONS: Record<string, object> = {
  "companion-maya": {
    id: "companion-maya", displayName: "Maya R.", verified: true,
    biography: "Retired curator with a love for contemporary art and good conversation. Patient, warm, and genuinely curious about people.",
    activities: ["Museum visits", "Coffee conversations", "Farmers market walks", "Gallery tours"],
    languages: ["English", "Spanish"], hourlyRate: 65,
    serviceArea: "San Francisco", city: "CA",
    photoUrl: null, rating: 4.9, reviewCount: 3, responseTime: "within 2h",
    boundaries: ["Platonic connection only", "Public meeting places only", "Mutual respect at every step"],
    availability: [
      { day: "Mon", hours: "10am – 8pm" }, { day: "Tue", hours: "10am – 8pm" },
      { day: "Wed", hours: "10am – 8pm" }, { day: "Thu", hours: "10am – 8pm" },
      { day: "Fri", hours: "10am – 6pm" }, { day: "Sat", hours: "12pm – 6pm" },
    ],
    memberSince: "Aug 2025", totalBookings: 46, acceptanceRate: 96, lastActiveLabel: "2 hrs ago",
  },
  "companion-jordan": {
    id: "companion-jordan", displayName: "Jordan K.", verified: true,
    biography: "Former chef turned food writer. Best company for anyone who takes eating seriously.",
    activities: ["Gallery tours", "Cooking classes", "Evening walks"],
    languages: ["English", "French"], hourlyRate: 75,
    serviceArea: "New York", city: "NY",
    photoUrl: null, rating: 4.8, reviewCount: 12, responseTime: "within 1h",
    boundaries: ["Platonic connection only", "Public meeting places only", "Mutual respect at every step"],
    availability: [
      { day: "Tue", hours: "11am – 9pm" }, { day: "Wed", hours: "11am – 9pm" },
      { day: "Thu", hours: "11am – 9pm" }, { day: "Fri", hours: "11am – 9pm" },
      { day: "Sun", hours: "12pm – 7pm" },
    ],
    memberSince: "Mar 2025", totalBookings: 89, acceptanceRate: 98, lastActiveLabel: "today",
  },
  "companion-simone": {
    id: "companion-simone", displayName: "Simone A.", verified: true,
    biography: "Architect by training, city walker by calling. I know Chicago's neighborhoods, hidden staircases, and the jazz venues locals actually go to. I love long conversations about design, memory, and what cities are for.",
    activities: ["Architecture tours", "Jazz evenings", "Museum visits", "Evening walks", "Coffee conversations"],
    languages: ["English", "French"], hourlyRate: 60,
    serviceArea: "Chicago", city: "IL",
    photoUrl: null, rating: 4.9, reviewCount: 19, responseTime: "within 3h",
    boundaries: ["Platonic connection only", "Public meeting places only", "Mutual respect at every step"],
    availability: [
      { day: "Mon", hours: "12pm – 9pm" }, { day: "Wed", hours: "12pm – 9pm" },
      { day: "Thu", hours: "12pm – 9pm" }, { day: "Fri", hours: "12pm – 10pm" },
      { day: "Sat", hours: "10am – 8pm" }, { day: "Sun", hours: "12pm – 6pm" },
    ],
    memberSince: "May 2025", totalBookings: 62, acceptanceRate: 94, lastActiveLabel: "today",
  },
  "companion-alex": {
    id: "companion-alex", displayName: "Alex T.", verified: true,
    biography: "I moved to Seattle for the mountains and stayed for the food. Whether it's Pike Place at 8am or a quiet bar in Fremont, I'll make you feel like you've lived here for years.",
    activities: ["Hiking", "Farmers market walks", "Coffee conversations", "Brewery tours", "Evening walks"],
    languages: ["English"], hourlyRate: 55,
    serviceArea: "Seattle", city: "WA",
    photoUrl: null, rating: 4.7, reviewCount: 8, responseTime: "within 2h",
    boundaries: ["Platonic connection only", "Public meeting places only", "Mutual respect at every step"],
    availability: [
      { day: "Mon", hours: "9am – 6pm" }, { day: "Tue", hours: "9am – 6pm" },
      { day: "Thu", hours: "9am – 6pm" }, { day: "Fri", hours: "9am – 8pm" },
      { day: "Sat", hours: "8am – 4pm" },
    ],
    memberSince: "Jun 2025", totalBookings: 31, acceptanceRate: 92, lastActiveLabel: "3 hrs ago",
  },
  "companion-priya": {
    id: "companion-priya", displayName: "Priya M.", verified: true,
    biography: "Sommelier and weekend trail runner. I make every outing feel intentional — whether we're tasting wines in Napa or hiking Griffith Park at sunrise. LA is a city that rewards curiosity, and I love sharing that.",
    activities: ["Wine tasting", "Hiking", "Restaurant dining", "Museum visits", "Beach visits"],
    languages: ["English", "Hindi"], hourlyRate: 80,
    serviceArea: "Los Angeles", city: "CA",
    photoUrl: null, rating: 4.9, reviewCount: 27, responseTime: "within 1h",
    boundaries: ["Platonic connection only", "Public meeting places only", "Mutual respect at every step"],
    availability: [
      { day: "Wed", hours: "11am – 8pm" }, { day: "Thu", hours: "11am – 8pm" },
      { day: "Fri", hours: "11am – 9pm" }, { day: "Sat", hours: "9am – 7pm" },
      { day: "Sun", hours: "10am – 5pm" },
    ],
    memberSince: "Jan 2025", totalBookings: 114, acceptanceRate: 97, lastActiveLabel: "today",
  },
  "companion-devon": {
    id: "companion-devon", displayName: "Devon H.", verified: true,
    biography: "Jazz musician, lifelong Bostonian. I know every corner of this city — the ICA on a quiet Thursday, the best bowl of clam chowder, the walk through the Public Garden when the swan boats are out. History, music, or a long lunch: I'm up for any of it.",
    activities: ["Museum visits", "Jazz evenings", "Walking tours", "Coffee conversations", "Farmers market walks"],
    languages: ["English"], hourlyRate: 70,
    serviceArea: "Boston", city: "MA",
    photoUrl: null, rating: 4.8, reviewCount: 22, responseTime: "within 2h",
    boundaries: ["Platonic connection only", "Public meeting places only", "Mutual respect at every step"],
    availability: [
      { day: "Mon", hours: "11am – 8pm" }, { day: "Tue", hours: "11am – 8pm" },
      { day: "Thu", hours: "11am – 9pm" }, { day: "Fri", hours: "12pm – 9pm" },
      { day: "Sat", hours: "10am – 7pm" },
    ],
    memberSince: "Apr 2025", totalBookings: 53, acceptanceRate: 95, lastActiveLabel: "1 hr ago",
  },
  "companion-isadora": {
    id: "companion-isadora", displayName: "Isadora V.", verified: true,
    biography: "Miami native, multilingual, deeply local. I take people to the places they'd never find on their own — an afternoon in Little Havana, a gallery opening in Wynwood, or a walk along the bay at golden hour. Every visit is personal.",
    activities: ["Gallery tours", "Evening walks", "Restaurant dining", "Beach visits", "Coffee conversations"],
    languages: ["English", "Spanish", "Portuguese"], hourlyRate: 65,
    serviceArea: "Miami", city: "FL",
    photoUrl: null, rating: 4.9, reviewCount: 41, responseTime: "within 1h",
    boundaries: ["Platonic connection only", "Public meeting places only", "Mutual respect at every step"],
    availability: [
      { day: "Tue", hours: "10am – 8pm" }, { day: "Wed", hours: "10am – 8pm" },
      { day: "Fri", hours: "10am – 10pm" }, { day: "Sat", hours: "9am – 8pm" },
      { day: "Sun", hours: "11am – 6pm" },
    ],
    memberSince: "Feb 2025", totalBookings: 78, acceptanceRate: 98, lastActiveLabel: "today",
  },
  "companion-theo": {
    id: "companion-theo", displayName: "Theo L.", verified: true,
    biography: "Policy analyst who'd rather be at a museum. Washington D.C. is all monuments if you don't know where to look — but I do. The Freer Gallery at closing time, a booth at Ben's Chili Bowl, a walk along the Tidal Basin before the tourists arrive. I make the city feel like yours.",
    activities: ["Museum visits", "Walking tours", "Coffee conversations", "Evening walks", "Restaurant dining"],
    languages: ["English", "French"], hourlyRate: 72,
    serviceArea: "Washington D.C.", city: "DC",
    photoUrl: null, rating: 4.8, reviewCount: 16, responseTime: "within 3h",
    boundaries: ["Platonic connection only", "Public meeting places only", "Mutual respect at every step"],
    availability: [
      { day: "Mon", hours: "12pm – 8pm" }, { day: "Wed", hours: "12pm – 8pm" },
      { day: "Thu", hours: "12pm – 8pm" }, { day: "Sat", hours: "10am – 6pm" },
      { day: "Sun", hours: "11am – 5pm" },
    ],
    memberSince: "Jul 2025", totalBookings: 29, acceptanceRate: 93, lastActiveLabel: "2 hrs ago",
  },
  "companion-ruth": {
    id: "companion-ruth", displayName: "Ruth K.", verified: true,
    biography: "Botanist turned urban farmer. Denver's altitude, light, and open spaces are unlike anywhere else — and so is the food scene. I love a long walk in Washington Park, a visit to the Denver Botanic Gardens, or a quiet afternoon at a rooftop brewery watching the Rockies turn pink.",
    activities: ["Hiking", "Farmers market walks", "Brewery tours", "Museum visits", "Evening walks"],
    languages: ["English"], hourlyRate: 58,
    serviceArea: "Denver", city: "CO",
    photoUrl: null, rating: 4.7, reviewCount: 11, responseTime: "within 2h",
    boundaries: ["Platonic connection only", "Public meeting places only", "Mutual respect at every step"],
    availability: [
      { day: "Mon", hours: "9am – 6pm" }, { day: "Tue", hours: "9am – 6pm" },
      { day: "Thu", hours: "9am – 7pm" }, { day: "Sat", hours: "8am – 5pm" },
      { day: "Sun", hours: "9am – 4pm" },
    ],
    memberSince: "Jun 2025", totalBookings: 37, acceptanceRate: 91, lastActiveLabel: "4 hrs ago",
  },
};

router.get("/companions/:id", async (req, res) => {
  const { id } = GetCompanionParams.parse(req.params);
  try {
    const [row] = await getApprovedCompanion(id);
    if (!row) {
      // Dev fallback: return a fixture if one exists for this ID
      if (process.env.NODE_ENV === "development" && DEV_COMPANIONS[id]) {
        res.json(DEV_COMPANIONS[id]); return;
      }
      res.status(404).json({ error: "Companion not found" });
      return;
    }
    res.json(mapCompanionRow(row));
  } catch (err) {
    // Dev fallback: Supabase unavailable — serve fixture if available, else 503
    if (process.env.NODE_ENV === "development" && DEV_COMPANIONS[id]) {
      res.json(DEV_COMPANIONS[id]); return;
    }
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
    const [row] = await getApprovedCompanion(companionId);
    if (!row) {
      res.status(404).json({ error: "Companion not found" });
      return;
    }
    const quote = calculatePrice(row.hourly_rate, durationHours, companionId);
    res.json(quote);
  } catch (err) {
    // Dev fallback: Supabase unavailable — compute price from DEV_COMPANIONS fixture
    if (process.env.NODE_ENV === "development") {
      const fixture = DEV_COMPANIONS[companionId] as any;
      if (fixture) {
        const quote = calculatePrice(fixture.hourlyRate, durationHours, companionId);
        res.json(quote); return;
      }
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

  // Auth — falls back to a preview ID in development so the flow can be tested
  // before Task #1 (auth) lands. Never permitted in production.
  const customerId =
    getActorId(req, "customer");
  if (!customerId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const [row] = await getApprovedCompanion(body.companionId);
    if (!row) {
      res.status(404).json({ error: "Companion not found" });
      return;
    }

    const price = calculatePrice(
      row.hourly_rate,
      body.durationHours,
      body.companionId,
    );

    // Zod coerces format:date fields to Date objects — serialize back to ISO strings
    const dateStr =
      body.date instanceof Date
        ? body.date.toISOString().split("T")[0]
        : String(body.date);

    const [booking] = await db
      .insert(bookings)
      .values({
        customerId,
        companionId: body.companionId,
        activity: body.activity,
        date: dateStr,
        startTime: body.startTime,
        durationHours: String(body.durationHours),
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

    req.log.info(
      { bookingId: booking.id, totalCents: booking.totalCents },
      "Booking intent created",
    );

    res.status(201).json(formatBooking(booking));
  } catch (err) {
    // Dev fallback: DB unavailable — create a transient in-memory booking so the UI can proceed
    if (process.env.NODE_ENV === "development") {
      const fixture = DEV_COMPANIONS[body.companionId] as any;
      if (fixture) {
        const price = calculatePrice(fixture.hourlyRate, body.durationHours, body.companionId);
        const dateStr = body.date instanceof Date ? body.date.toISOString().split("T")[0] : String(body.date);
        const devId = `dev-new-${Date.now()}`;
        const devBooking = {
          id: devId, customerId, companionId: body.companionId,
          activity: body.activity, date: dateStr, startTime: body.startTime,
          durationHours: body.durationHours, safeSpotId: body.safeSpotId,
          status: "requested",
          subtotalCents: price.subtotalCents, customerFeeCents: price.customerFeeCents,
          totalCents: price.totalCents, companionPayoutCents: price.companionPayoutCents,
          platformRevenueCents: price.platformRevenueCents, depositCents: price.depositCents,
          depositPaidAt: null, authorizedAt: null, confirmedAt: null,
          cancelledAt: null, cancellationReason: null,
        };
        (DEV_BOOKING_FIXTURES as any)[devId] = devBooking;
        req.log.info({ bookingId: devId }, "Dev: booking created in-memory");
        res.status(201).json(devBooking); return;
      }
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
    res.json(rows.map(formatBookingFull));
  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      res.json(Object.values(DEV_BOOKING_FIXTURES).filter((b: any) => b.customerId === "dev-preview-customer")); return;
    }
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Unable to list bookings");
    res.status(503).json({ error: "Bookings temporarily unavailable" });
  }
});

router.get("/bookings/:id", async (req, res) => {
  const { id } = req.params;
  const customerId =
    getActorId(req, "customer");
  if (!customerId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || booking.customerId !== customerId) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    res.json(formatBookingFull(booking));
  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      const fixture = DEV_BOOKING_FIXTURES[id];
      if (fixture) { res.json(fixture); return; }
    }
    if (isMissingTableError(err)) { res.status(404).json({ error: "Booking not found" }); return; }
    req.log.error({ err }, "Unable to load booking");
    res.status(503).json({ error: "Booking temporarily unavailable" });
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
    // Dev fallback: Stripe not connected — simulate deposit instantly
    if (process.env.NODE_ENV === "development") {
      try {
        await db.update(bookings)
          .set({ status: "deposit_paid", depositPaidAt: new Date().toISOString() })
          .where(eq(bookings.id, id));
        req.log.info({ bookingId: id }, "Dev: deposit simulated — booking advanced to deposit_paid");
        res.json({ bookingId: id, amountCents: 1000, devSimulated: true }); return;
      } catch (dbErr) {
        // DB also unavailable — still return simulated success so UI can proceed
        req.log.warn({ dbErr }, "Dev: deposit simulated without DB update");
        res.json({ bookingId: id, amountCents: 1000, devSimulated: true }); return;
      }
    }
    req.log.error({ err }, "Unable to create deposit payment intent");
    res.status(500).json({ error: "Unable to initiate deposit" });
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

    // Full payment: customer pays totalCents.
    // When companion has a Stripe Connect account, platform keeps application_fee_amount
    // and the rest is transferred to the companion's account automatically.
    const companionAccountId = devCompanionStripeAccounts.get(booking.companionId);
    const pi = await stripe.paymentIntents.create({
      amount: booking.totalCents,
      currency: "usd",
      ...(companionAccountId
        ? {
            application_fee_amount: booking.platformRevenueCents,
            transfer_data: { destination: companionAccountId },
          }
        : {}),
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
      .set({ fullPaymentIntentId: pi.id, status: "authorized" })
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
    // Dev fallback: Stripe not connected — simulate full payment instantly
    if (process.env.NODE_ENV === "development") {
      try {
        await db.update(bookings)
          .set({ status: "authorized", authorizedAt: new Date().toISOString() })
          .where(eq(bookings.id, id));
        req.log.info({ bookingId: id }, "Dev: full payment simulated — booking advanced to authorized");
        res.json({ bookingId: id, amountCents: 0, devSimulated: true }); return;
      } catch (dbErr) {
        req.log.warn({ dbErr }, "Dev: full payment simulated without DB update");
        res.json({ bookingId: id, amountCents: 0, devSimulated: true }); return;
      }
    }
    req.log.error({ err }, "Unable to create full payment intent");
    res.status(500).json({ error: "Unable to initiate payment" });
  }
});

// ---------------------------------------------------------------------------
// Companion booking inbox — view, accept, decline requests
// ---------------------------------------------------------------------------

router.get("/companion/bookings", async (req, res) => {
  const companionId =
    getActorId(req, "companion");
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.companionId, companionId))
      .orderBy(desc(bookings.createdAt));
    res.json(rows.map(formatBookingFull));
  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      res.json(Object.values(DEV_BOOKING_FIXTURES).filter((b: any) => b.companionId === "companion-maya")); return;
    }
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Unable to list companion bookings");
    res.status(503).json({ error: "Bookings temporarily unavailable" });
  }
});

router.get("/companion/bookings/:id", async (req, res) => {
  const { id } = req.params;
  const companionId =
    getActorId(req, "companion");
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || booking.companionId !== companionId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    res.json({ ...formatBookingFull(booking), viewerRole: "companion" });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      const fixture = DEV_BOOKING_FIXTURES[id] as any;
      if (fixture && fixture.companionId === "companion-maya") { res.json({ ...fixture, viewerRole: "companion" }); return; }
    }
    if (isMissingTableError(err)) { res.status(404).json({ error: "Booking not found" }); return; }
    req.log.error({ err }, "Unable to load companion booking");
    res.status(503).json({ error: "Booking temporarily unavailable" });
  }
});

router.post("/bookings/:id/accept", async (req, res) => {
  const { id } = req.params;
  const companionId =
    getActorId(req, "companion");
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || booking.companionId !== companionId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!["deposit_paid", "authorized"].includes(booking.status)) {
      res.status(409).json({ error: "Booking cannot be accepted in its current state" }); return;
    }
    const [updated] = await db
      .update(bookings)
      .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
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
  const companionId =
    getActorId(req, "companion");
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || booking.companionId !== companionId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (["confirmed", "completed", "cancelled"].includes(booking.status)) {
      res.status(409).json({ error: "Booking cannot be declined in its current state" }); return;
    }
    const [updated] = await db
      .update(bookings)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    res.json(formatBookingFull(updated));
  } catch (err: any) {
    // Dev fallback: mutate fixture in-memory
    if (process.env.NODE_ENV === "development") {
      const fixture = DEV_BOOKING_FIXTURES[id] as any;
      if (fixture) {
        if (["confirmed", "completed", "cancelled"].includes(fixture.status)) {
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
    const newDuration = booking.durationHours + extraMinutes / 60;
    const [updated] = await db
      .update(bookings)
      .set({ durationHours: newDuration, updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    res.json({ ...formatBookingFull(updated), extendedBy: extraMinutes });
  } catch (err: any) {
    if (isMissingTableError(err)) {
      res.json({ id, extendedBy: extraMinutes }); return;
    }
    req.log.error({ err }, "Failed to extend booking");
    res.status(503).json({ error: "Could not extend booking" });
  }
});

router.post("/bookings/:id/complete", async (req, res) => {
  const { id } = req.params;
  const companionId =
    getActorId(req, "companion");
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }

  // Dev fallback — mutate fixture
  if (process.env.NODE_ENV === "development") {
    const fixture = DEV_BOOKING_FIXTURES[id] as any;
    if (fixture) {
      if (!["confirmed", "deposit_paid"].includes(fixture.status)) {
        res.status(409).json({ error: "Booking is not in a completable state" }); return;
      }
      fixture.status = "completed";
      fixture.completedAt = new Date().toISOString();
      req.log.info({ bookingId: id }, "Booking completed (dev)");
      res.json(fixture); return;
    }
    // Unknown booking ID in dev — succeed anyway
    res.json({ id, status: "completed", completedAt: new Date().toISOString() }); return;
  }

  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || booking.companionId !== companionId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!["confirmed", "deposit_paid"].includes(booking.status)) {
      res.status(409).json({ error: "Booking is not in a completable state" }); return;
    }
    const [updated] = await db
      .update(bookings)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    res.json(formatBookingFull(updated));
  } catch (err: any) {
    if (isMissingTableError(err)) {
      res.json({ id, status: "completed", completedAt: new Date().toISOString() }); return;
    }
    req.log.error({ err }, "Failed to complete booking");
    res.status(503).json({ error: "Could not complete booking" });
  }
});

router.post("/bookings/:id/checkin", async (req, res) => {
  const { id } = req.params;
  const { venue } = req.body ?? {};
  const actorId = getActorId(req, "customer");
  if (!actorId) { res.status(401).json({ error: "Authentication required" }); return; }

  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
    if (booking.customerId !== actorId && booking.companionId !== actorId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!["confirmed", "deposit_paid", "authorized"].includes(booking.status)) {
      res.status(409).json({ error: "Check-in not available for this booking" }); return;
    }
    const existing = await db.select().from(checkIns).where(eq(checkIns.bookingId, id)).limit(1);
    if (existing[0]) {
      res.json({ bookingId: id, checkedInAt: existing[0].createdAt, venue: existing[0].venue, alreadyRecorded: true });
      return;
    }
    const [row] = await db.insert(checkIns).values({
      bookingId: id,
      accountId: actorId,
      venue: venue ? String(venue).slice(0, 120) : null,
      kind: "arrival",
    }).returning();
    req.log.info({ bookingId: id, venue }, "SafeSpot check-in");
    res.json({ bookingId: id, checkedInAt: row.createdAt, venue: row.venue });
  } catch (err: unknown) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      checkedInBookings.add(id);
      res.json({ bookingId: id, checkedInAt: new Date().toISOString(), venue });
      return;
    }
    req.log.error({ err }, "Check-in failed");
    res.status(503).json({ error: "Could not record check-in" });
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
    const [updated] = await db
      .update(bookings)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();
    req.log.info({ bookingId: id, reason }, "Booking cancelled by customer");
    res.json(formatBookingFull(updated));
  } catch (err: any) {
    if (isMissingTableError(err)) { res.json({ id, status: "cancelled" }); return; }
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
      ["requested", "authorized", "deposit_paid"].includes(b.status),
    ).length;
    const completedCount = rows.filter((b) => b.status === "confirmed").length;

    res.json({
      upcomingBookings: upcomingCount,
      completedBookings: completedCount,
      savedCompanions: 0,
      safetyPlans: upcomingCount,
    });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      const devBookings = Object.values(DEV_BOOKING_FIXTURES) as any[];
      const mine = devBookings.filter((b) => b.customerId === "dev-preview-customer");
      const upcomingCount = mine.filter((b) => ["requested", "authorized", "deposit_paid", "confirmed"].includes(b.status)).length;
      const completedCount = mine.filter((b) => b.status === "completed").length;
      res.json({ upcomingBookings: upcomingCount, completedBookings: completedCount, savedCompanions: 2, safetyPlans: upcomingCount }); return;
    }
    // Tables don't exist yet (schema created in Task #1) — check full error chain
    if (isMissingTableError(err)) {
      req.log.warn("Dashboard tables not yet created — returning empty stats");
      res.json({ upcomingBookings: 0, completedBookings: 0, savedCompanions: 0, safetyPlans: 0 });
      return;
    }
    req.log.error({ err }, "Unable to load customer dashboard");
    res.status(503).json({ error: "Dashboard temporarily unavailable" });
  }
});

router.get("/dashboard/companion", async (req, res) => {
  const companionId =
    getActorId(req, "companion");
  if (!companionId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const [companionBookings, companionRequests] = await Promise.all([
      db.select().from(bookings).where(eq(bookings.companionId, companionId)),
      db.select().from(favorRequests).where(eq(favorRequests.companionId, companionId)),
    ]);
    const pendingReqs = companionRequests.filter((r) => r.status === "pending").length;
    const upcomingCount = companionBookings.filter((b) =>
      ["authorized", "deposit_paid"].includes(b.status),
    ).length;
    const earningsCents = companionBookings
      .filter((b) => b.status === "confirmed")
      .reduce((sum, b) => sum + b.companionPayoutCents, 0);

    res.json({ pendingRequests: pendingReqs, upcomingBookings: upcomingCount, earningsCents, profileViews: 0 });
  } catch (err: any) {
    if (process.env.NODE_ENV === "development") {
      const devBookings = Object.values(DEV_BOOKING_FIXTURES) as any[];
      const mine = devBookings.filter((b) => b.companionId === "companion-maya");
      const pendingReqs = mine.filter((b) => b.status === "requested").length;
      const upcomingCount = mine.filter((b) => ["authorized", "deposit_paid", "confirmed"].includes(b.status)).length;
      const earningsCents = mine.filter((b) => b.status === "completed").reduce((s: number, b: any) => s + b.companionPayoutCents, 0);
      res.json({ pendingRequests: pendingReqs, upcomingBookings: upcomingCount, earningsCents, profileViews: 14 }); return;
    }
    // Tables don't exist yet (schema created in Task #1) — check full error chain
    if (isMissingTableError(err)) {
      req.log.warn("Dashboard tables not yet created — returning empty stats");
      res.json({ pendingRequests: 0, upcomingBookings: 0, earningsCents: 0, profileViews: 0 });
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
  const userId =
    getActorId(req, "customer");
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== userId && booking.companionId !== userId)) {
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
  const userId =
    getActorId(req, "customer");
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const rawBody = String(req.body?.body ?? "").trim();
  if (!rawBody) { res.status(400).json({ error: "Message body is required" }); return; }
  if (rawBody.length > 500) { res.status(400).json({ error: "Message exceeds 500 characters" }); return; }
  const body = maskBody(rawBody);

  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || (booking.customerId !== userId && booking.companionId !== userId)) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    if (!CHAT_STATUSES.includes(booking.status)) {
      res.status(403).json({ error: "Chat unlocks after deposit is paid" }); return;
    }
    const senderRole = booking.companionId === userId ? "companion" : "customer";

    try {
      const [msg] = await db.insert(messages).values({ bookingId: id, senderId: userId, senderRole, body }).returning();
      res.status(201).json({ ...msg, createdAt: msg.createdAt.toISOString() });
    } catch (err: any) {
      if (isMissingTableError(err)) {
        // Dev fallback — store in memory
        const msg: DevMessage = { id: crypto.randomUUID(), bookingId: id, senderId: userId, senderRole, body, createdAt: new Date().toISOString() };
        if (!devMessages.has(id)) devMessages.set(id, []);
        devMessages.get(id)!.push(msg);
        res.status(201).json(msg); return;
      }
      throw err;
    }
  } catch (err: any) {
    if (isMissingTableError(err)) {
      const msg: DevMessage = { id: crypto.randomUUID(), bookingId: id, senderId: "dev-preview-customer", senderRole: "customer", body, createdAt: new Date().toISOString() };
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

const devReviews: DevReview[] = [
  {
    id: "rev-demo-1",
    bookingId: "bk-demo-1",
    companionId: "companion-maya",
    customerId: "cust-demo-1",
    rating: 5,
    comment: "Maya was thoughtful, punctual, and made the afternoon feel easy. The gallery she chose was perfect. Already planning the next one.",
    createdAt: new Date(Date.now() - 8 * 86400_000).toISOString(),
  },
  {
    id: "rev-demo-2",
    bookingId: "bk-demo-2",
    companionId: "companion-maya",
    customerId: "cust-demo-2",
    rating: 5,
    comment: "Genuinely warm and attentive. She remembered details from my messages and the conversation never ran dry.",
    createdAt: new Date(Date.now() - 22 * 86400_000).toISOString(),
  },
  {
    id: "rev-demo-3",
    bookingId: "bk-demo-3",
    companionId: "companion-maya",
    customerId: "cust-demo-3",
    rating: 4,
    comment: "Great time at the farmers market. Very present and easy to be around.",
    createdAt: new Date(Date.now() - 45 * 86400_000).toISOString(),
  },
];

/** bookingIds that have already been reviewed, to enforce one-review-per-booking */
const reviewedBookings = new Set<string>(["bk-demo-1", "bk-demo-2", "bk-demo-3"]);

router.post("/companions/:id/report", async (req, res) => {
  const { id } = req.params;
  const { reason, note } = req.body ?? {};
  if (!reason) { res.status(400).json({ error: "A reason is required" }); return; }
  try {
    const [row] = await db.insert(incidentReports).values({
      reporterId: req.user?.id ?? null,
      companionId: id,
      reportType: String(reason).slice(0, 80),
      detail: String(note ?? reason).slice(0, 1500),
      urgent: false,
    }).returning();
    req.log.warn({ companionId: id, reportId: row.id }, "Companion report submitted");
    res.json({ received: true, id: row.id, message: "Report received. Our trust team will review within 24 hours." });
  } catch (err: unknown) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json({ received: true, message: "Report received. Our trust team will review within 24 hours." });
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
    res.status(201).json({ id: row.id, status: row.status });
  } catch (err: unknown) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.status(201).json({ id: `dev-report-${Date.now()}`, status: "open" });
      return;
    }
    req.log.error({ err }, "Safety report failed");
    res.status(503).json({ error: "Could not submit report" });
  }
});

router.get("/companions/:id/reviews", async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await db
      .select()
      .from(reviewRows)
      .where(eq(reviewRows.companionId, id))
      .orderBy(desc(reviewRows.createdAt));
    res.json(rows);
  } catch (err: unknown) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      res.json(devReviews.filter((r) => r.companionId === id));
      return;
    }
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Reviews lookup failed");
    res.status(503).json({ error: "Reviews temporarily unavailable" });
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

    const review: DevReview = {
      id: crypto.randomUUID(),
      bookingId: id,
      companionId: booking.companionId,
      customerId,
      rating,
      comment: comment ? String(comment).trim() : "",
      createdAt: new Date().toISOString(),
    };

    devReviews.push(review);
    reviewedBookings.add(id);
    req.log.info({ bookingId: id, rating }, "Review submitted");
    res.status(201).json(review);
  } catch (err: any) {
    if (isMissingTableError(err)) {
      // Dev: booking table missing — accept review against fixture's companion
      const fixtureBooking = DEV_BOOKING_FIXTURES[id] as any;
      const review: DevReview = {
        id: crypto.randomUUID(),
        bookingId: id,
        companionId: fixtureBooking?.companionId ?? "companion-maya",
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
type EarningsTransaction = {
  id: string; bookingId: string; date: string; activity: string;
  durationHours: number; grossCents: number; commissionCents: number; netCents: number;
  status: 'paid' | 'pending' | 'processing';
};

function makeEarningsData() {
  const now = new Date();
  const months: EarningsMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString('en-US', { month: 'short' });
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    // Realistic ramp-up: newer months have more activity
    const bookingCount = Math.max(0, 3 + (5 - i) * 2 + (i === 0 ? -2 : 0));
    // Each booking averages ~$165 net (3 hrs at $65 × 85%)
    const earningsCents = bookingCount * (145_00 + Math.round(Math.random() * 40_00));
    months.push({ month, label, earningsCents, bookingCount });
  }
  return months;
}

const DEV_EARNINGS_MONTHS = makeEarningsData();

const DEV_EARNINGS_TRANSACTIONS: EarningsTransaction[] = [
  { id: 'txn-1', bookingId: 'bk-101', date: new Date(Date.now() - 2 * 86400_000).toISOString(), activity: 'Museum visit', durationHours: 3, grossCents: 195_00, commissionCents: 29_25, netCents: 165_75, status: 'paid' },
  { id: 'txn-2', bookingId: 'bk-102', date: new Date(Date.now() - 5 * 86400_000).toISOString(), activity: 'Coffee conversation', durationHours: 2, grossCents: 130_00, commissionCents: 19_50, netCents: 110_50, status: 'paid' },
  { id: 'txn-3', bookingId: 'bk-103', date: new Date(Date.now() - 9 * 86400_000).toISOString(), activity: 'Gallery tour', durationHours: 4, grossCents: 260_00, commissionCents: 39_00, netCents: 221_00, status: 'paid' },
  { id: 'txn-4', bookingId: 'bk-104', date: new Date(Date.now() - 12 * 86400_000).toISOString(), activity: 'Farmers market walk', durationHours: 2, grossCents: 130_00, commissionCents: 19_50, netCents: 110_50, status: 'paid' },
  { id: 'txn-5', bookingId: 'bk-105', date: new Date(Date.now() - 1 * 86400_000).toISOString(), activity: 'Evening gallery visit', durationHours: 3, grossCents: 195_00, commissionCents: 29_25, netCents: 165_75, status: 'processing' },
  { id: 'txn-6', bookingId: 'bk-106', date: new Date(Date.now() + 2 * 86400_000).toISOString(), activity: 'Coffee conversation', durationHours: 2, grossCents: 130_00, commissionCents: 19_50, netCents: 110_50, status: 'pending' },
];

router.get("/companion/earnings", async (req, res) => {
  const companionId =
    getActorId(req, "companion");
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }

  const lifetimeCents = DEV_EARNINGS_MONTHS.reduce((s, m) => s + m.earningsCents, 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonthCents = DEV_EARNINGS_MONTHS.find((m) => m.month === currentMonth)?.earningsCents ?? 0;
  const pendingCents = DEV_EARNINGS_TRANSACTIONS
    .filter((t) => t.status === 'pending' || t.status === 'processing')
    .reduce((s, t) => s + t.netCents, 0);
  const thisYearCents = DEV_EARNINGS_MONTHS
    .filter((m) => m.month.startsWith(String(new Date().getFullYear())))
    .reduce((s, m) => s + m.earningsCents, 0);

  res.json({
    lifetimeCents, thisMonthCents, pendingCents, thisYearCents,
    monthlyBreakdown: DEV_EARNINGS_MONTHS,
    recentTransactions: DEV_EARNINGS_TRANSACTIONS.slice(0, 8),
    totalBookings: DEV_EARNINGS_MONTHS.reduce((s, m) => s + m.bookingCount, 0),
  });
});

// ---------------------------------------------------------------------------
// Notifications — in-app alerts for booking events and messages
// ---------------------------------------------------------------------------

type NotifKind = 'booking_request' | 'booking_accepted' | 'booking_declined' | 'new_message' | 'payout_ready';

type DevNotif = {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
  /** 'customer' | 'companion' — which role sees this */
  audience: 'customer' | 'companion';
};

const devNotifications: DevNotif[] = [
  {
    id: 'notif-1',
    kind: 'booking_request',
    title: 'New booking request',
    body: 'A customer wants to book 3 hours on Saturday. Review and respond.',
    href: '/dashboard/companion',
    createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    read: false,
    audience: 'companion',
  },
  {
    id: 'notif-2',
    kind: 'new_message',
    title: 'New message',
    body: 'Your customer sent a message — tap to reply.',
    href: '/dashboard/companion',
    createdAt: new Date(Date.now() - 38 * 60_000).toISOString(),
    read: false,
    audience: 'companion',
  },
  {
    id: 'notif-3',
    kind: 'payout_ready',
    title: 'Payout on its way',
    body: '$110.50 is being transferred to your connected bank account.',
    href: '/dashboard/companion',
    createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    read: true,
    audience: 'companion',
  },
  {
    id: 'notif-4',
    kind: 'booking_accepted',
    title: 'Booking confirmed',
    body: 'Your companion accepted the request. Complete payment to lock it in.',
    href: '/dashboard/customer',
    createdAt: new Date(Date.now() - 25 * 60_000).toISOString(),
    read: false,
    audience: 'customer',
  },
  {
    id: 'notif-5',
    kind: 'new_message',
    title: 'New message',
    body: 'Your companion replied to your question.',
    href: '/dashboard/customer',
    createdAt: new Date(Date.now() - 55 * 60_000).toISOString(),
    read: false,
    audience: 'customer',
  },
  {
    id: 'notif-6',
    kind: 'booking_declined',
    title: 'Booking not available',
    body: "Your companion couldn't take this date. Browse others nearby.",
    href: '/explore',
    createdAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
    read: true,
    audience: 'customer',
  },
];

/** Mark individual notification read (toggled by front-end) */
const readNotifIds = new Set<string>();

router.get("/notifications", (req, res) => {
  // Role detection: companions see companion audience, everyone else sees customer
  const isCompanion = req.query.role === 'companion';
  const audience: 'customer' | 'companion' = isCompanion ? 'companion' : 'customer';
  const items = devNotifications
    .filter((n) => n.audience === audience)
    .map((n) => ({ ...n, read: n.read || readNotifIds.has(n.id) }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(items);
});

router.post("/notifications/read-all", (req, res) => {
  const isCompanion = req.body?.role === 'companion';
  const audience: 'customer' | 'companion' = isCompanion ? 'companion' : 'customer';
  devNotifications.filter((n) => n.audience === audience).forEach((n) => readNotifIds.add(n.id));
  res.json({ ok: true });
});

router.post("/notifications/:id/read", (req, res) => {
  readNotifIds.add(req.params.id);
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
  displayName: "Alex M.",
  bio: "Patient, curious, and good at showing up. I enjoy gallery afternoons, farmers markets, and long walks with good conversation.",
  hourlyRateCents: 7000,
  activities: ["Museum visits", "Coffee conversations", "Farmers market walks", "Gallery tours"],
  languages: ["English"],
  serviceArea: "San Francisco, CA",
  availableDays: ["Fri", "Sat", "Sun"],
  availableHoursStart: "10:00",
  availableHoursEnd: "20:00",
  photoUrl: null,
};

/** In-memory store — replaced by Supabase companion_profiles once Task #1 lands */
const devCompanionProfiles = new Map<string, DevCompanionProfile>();

router.get("/companion/profile", async (req, res) => {
  const companionId =
    getActorId(req, "companion");
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }

  // Production: query Supabase companion_profiles table
  // Dev: return from in-memory store (or default if first visit)
  const profile = devCompanionProfiles.get(companionId) ?? DEFAULT_DEV_PROFILE;
  res.json(profile);
});

router.put("/companion/profile", async (req, res) => {
  const companionId =
    getActorId(req, "companion");
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }

  const { displayName, bio, hourlyRateCents, activities, languages, serviceArea, availableDays, availableHoursStart, availableHoursEnd } = req.body ?? {};

  // Validation
  if (!displayName?.trim()) { res.status(400).json({ error: "Display name is required" }); return; }
  if (!bio?.trim()) { res.status(400).json({ error: "Bio is required" }); return; }
  if (typeof hourlyRateCents !== "number" || hourlyRateCents < 2000 || hourlyRateCents > 50000) {
    res.status(400).json({ error: "Hourly rate must be between $20 and $500" }); return;
  }
  if (!Array.isArray(activities) || activities.length === 0) { res.status(400).json({ error: "At least one activity is required" }); return; }
  if (!Array.isArray(languages) || languages.length === 0) { res.status(400).json({ error: "At least one language is required" }); return; }

  const existing = devCompanionProfiles.get(companionId) ?? DEFAULT_DEV_PROFILE;
  const updated: DevCompanionProfile = {
    displayName: String(displayName).slice(0, 80),
    bio: String(bio).slice(0, 600),
    hourlyRateCents: Math.round(hourlyRateCents),
    activities: activities.slice(0, 12).map((a: unknown) => String(a).slice(0, 50)),
    languages: languages.slice(0, 8).map((l: unknown) => String(l).slice(0, 40)),
    serviceArea: String(serviceArea ?? "").slice(0, 100),
    availableDays: Array.isArray(availableDays) ? availableDays.slice(0, 7).map(String) : [],
    availableHoursStart: String(availableHoursStart ?? "09:00"),
    availableHoursEnd: String(availableHoursEnd ?? "21:00"),
    // Preserve photo from previous save — photo is updated separately via POST /companion/profile/photo
    photoUrl: existing.photoUrl ?? null,
  };

  devCompanionProfiles.set(companionId, updated);
  req.log.info({ companionId }, "Companion profile updated");
  res.json(updated);
});

// ---------------------------------------------------------------------------
// Companion profile photo upload (dev: stores base64 data URL in memory)
// ---------------------------------------------------------------------------

router.post("/companion/profile/photo", async (req, res) => {
  const companionId =
    getActorId(req, "companion");
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

  const existing = devCompanionProfiles.get(companionId) ?? DEFAULT_DEV_PROFILE;
  const updated = { ...existing, photoUrl: photoDataUrl };
  devCompanionProfiles.set(companionId, updated);
  req.log.info({ companionId }, "Companion profile photo updated");
  res.json({ photoUrl: photoDataUrl });
});

const DEV_COMPANION_APPLICATIONS = [
  { id: "app-001", displayName: "Maya R.", city: "San Francisco", activities: ["Museum visits", "Coffee conversations", "Farmers market walks"], languages: ["English", "Spanish"], hourlyRate: 65, applicationDate: "2026-08-10", bio: "Retired curator with a love for contemporary art and good conversation. Patient, warm, and genuinely curious about people.", status: "pending" },
  { id: "app-002", displayName: "Jordan K.", city: "New York", activities: ["Gallery tours", "Cooking classes", "Evening walks"], languages: ["English", "French"], hourlyRate: 75, applicationDate: "2026-08-11", bio: "Former chef turned food writer. Best company for anyone who takes eating seriously.", status: "pending" },
  { id: "app-003", displayName: "Sam T.", city: "Chicago", activities: ["Board games", "Book clubs", "City tours"], languages: ["English"], hourlyRate: 55, applicationDate: "2026-08-12", bio: "Professional librarian who knows every good spot in the city. Quiet energy, great listener.", status: "pending" },
];

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

router.post("/companion/applications", async (req, res) => {
  const { displayName, email, city, bio } = req.body as {
    displayName: string; email: string; city: string; bio: string;
  };
  if (!displayName || !email || !city || !bio) {
    res.status(400).json({ error: "All fields required" }); return;
  }
  try {
    const [row] = await db.insert(companionApplications).values({
      accountId: req.user?.id ?? null,
      displayName: String(displayName).slice(0, 80),
      email: String(email).trim().toLowerCase().slice(0, 160),
      city: String(city).slice(0, 80),
      bio: String(bio).slice(0, 2000),
    }).returning();
    req.log.info({ id: row.id }, "Companion application received");
    res.status(201).json({ id: row.id, status: row.status });
  } catch (err: unknown) {
    if (isMissingTableError(err) && process.env.NODE_ENV === "development") {
      const newApp = {
        id: `app-${Date.now()}`,
        displayName, email, city, bio,
        activities: [], languages: ["English"], hourlyRate: 60,
        applicationDate: new Date().toISOString().split("T")[0],
        status: "pending",
      };
      DEV_COMPANION_APPLICATIONS.push(newApp as (typeof DEV_COMPANION_APPLICATIONS)[number]);
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
      city: application.city,
      serviceArea: application.city,
      activities: application.activities,
      languages: application.languages,
      hourlyRate: application.hourlyRate,
      biography: application.bio,
      approved: true,
      verified: true,
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
    await writeAudit({
      actorId: req.user!.id,
      action: "account.suspend",
      subjectType: "account",
      subjectId: id,
      note: reason,
    });
    res.json({ id, suspended: true });
  } catch (err) {
    req.log.error({ err }, "Suspend account failed");
    res.status(503).json({ error: "Could not suspend account" });
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

const DEV_SAFESPOTS = [
  { id: "ss-sf-1",  name: "Blue Bottle Coffee Hayes",      category: "Café",          city: "CA", cityLabel: "San Francisco, CA",   addressHint: "Hayes Valley · large communal tables",        openLate: false },
  { id: "ss-sf-2",  name: "SFMOMA Lobby",                  category: "Museum",        city: "CA", cityLabel: "San Francisco, CA",   addressHint: "Mission District · staffed main entrance",    openLate: false },
  { id: "ss-sf-3",  name: "Ferry Building Marketplace",    category: "Public Market", city: "CA", cityLabel: "San Francisco, CA",   addressHint: "Embarcadero · open atrium, always busy",      openLate: false },
  { id: "ss-sf-4",  name: "The Commons Café",              category: "Café",          city: "CA", cityLabel: "San Francisco, CA",   addressHint: "Near Union Square, downtown",                 openLate: false },
  { id: "ss-ny-1",  name: "Ace Hotel Lobby",               category: "Hotel Lobby",   city: "NY", cityLabel: "New York, NY",        addressHint: "Midtown · open 24h, well-staffed",            openLate: true  },
  { id: "ss-ny-2",  name: "The High Line Café",            category: "Café",          city: "NY", cityLabel: "New York, NY",        addressHint: "Chelsea · outdoor, public seating",           openLate: false },
  { id: "ss-ny-3",  name: "Brooklyn Museum",               category: "Museum",        city: "NY", cityLabel: "New York, NY",        addressHint: "Crown Heights · lobby open to all",           openLate: false },
  { id: "ss-ny-4",  name: "Grand Central Lounge",          category: "Bar",           city: "NY", cityLabel: "New York, NY",        addressHint: "Midtown East, ground floor",                  openLate: true  },
  { id: "ss-chi-1", name: "Chicago Cultural Center",       category: "Museum",        city: "IL", cityLabel: "Chicago, IL",         addressHint: "Loop · grand atrium, free public entry",      openLate: false },
  { id: "ss-chi-2", name: "Riverside Public Library",      category: "Library",       city: "IL", cityLabel: "Chicago, IL",         addressHint: "River North branch · quiet, staffed desk",    openLate: false },
  { id: "ss-chi-3", name: "Eataly Chicago Café",           category: "Café",          city: "IL", cityLabel: "Chicago, IL",         addressHint: "River North · lively, visible seating",       openLate: true  },
  { id: "ss-sea-1", name: "Meridian Museum Café",          category: "Museum",        city: "WA", cityLabel: "Seattle, WA",         addressHint: "Capitol Hill · ground floor café",            openLate: false },
  { id: "ss-sea-2", name: "Pike Place Market Entrance",   category: "Public Market", city: "WA", cityLabel: "Seattle, WA",         addressHint: "Pike St & 1st Ave · busy, open-air",         openLate: false },
  { id: "ss-sea-3", name: "Amazon Spheres Lobby",         category: "Hotel Lobby",   city: "WA", cityLabel: "Seattle, WA",         addressHint: "South Lake Union · public lobby, staffed",    openLate: false },
  { id: "ss-aus-1", name: "Ember & Oak",                  category: "Restaurant",    city: "TX", cityLabel: "Austin, TX",          addressHint: "Downtown, street level, open kitchen",        openLate: true  },
  { id: "ss-aus-2", name: "Blanton Museum Lobby",         category: "Museum",        city: "TX", cityLabel: "Austin, TX",          addressHint: "UT Campus · airy entrance, easy exit",        openLate: false },
  { id: "ss-la-1",  name: "The Garden Hotel Lobby",       category: "Hotel Lobby",   city: "CA", cityLabel: "Los Angeles, CA",     addressHint: "West Hollywood · lobby level, concierge",     openLate: true  },
  { id: "ss-la-2",  name: "LACMA Entry Pavilion",         category: "Museum",        city: "CA", cityLabel: "Los Angeles, CA",     addressHint: "Mid-Wilshire · open courtyard, staffed",      openLate: false },
  { id: "ss-mia-1", name: "The Setai Hotel Lobby",        category: "Hotel Lobby",   city: "FL", cityLabel: "Miami, FL",           addressHint: "South Beach · concierge desk visible",        openLate: true  },
  { id: "ss-mia-2", name: "Wynwood Café",                 category: "Café",          city: "FL", cityLabel: "Miami, FL",           addressHint: "Wynwood · street-level, art district",        openLate: false },
  { id: "ss-bos-1", name: "Boston Public Library Foyer",  category: "Library",       city: "MA", cityLabel: "Boston, MA",          addressHint: "Copley Sq · manned entrance desk",            openLate: false },
  { id: "ss-bos-2", name: "The Newbury Lobby",            category: "Hotel Lobby",   city: "MA", cityLabel: "Boston, MA",          addressHint: "Back Bay · grand lobby, staffed 24h",         openLate: true  },
  { id: "ss-den-1", name: "Denver Art Museum Café",       category: "Café",          city: "CO", cityLabel: "Denver, CO",          addressHint: "Golden Triangle · ground floor café",         openLate: false },
  { id: "ss-dc-1",  name: "National Portrait Gallery",    category: "Museum",        city: "DC", cityLabel: "Washington, D.C.",    addressHint: "Penn Quarter · Penn Ave entrance",            openLate: false },
  { id: "ss-atl-1", name: "Ponce City Market Atrium",     category: "Public Market", city: "GA", cityLabel: "Atlanta, GA",         addressHint: "Old Fourth Ward · open, visible seating",     openLate: true  },
  { id: "ss-por-1", name: "Powell's Books Café",          category: "Café",          city: "OR", cityLabel: "Portland, OR",        addressHint: "Pearl District · lively, always open",        openLate: false },
];

// In-memory SafeSpot applications (pending venue approvals)
type SafeSpotApplication = {
  id: string; name: string; address: string; city: string; type: string;
  contactEmail: string; contactName: string; description: string;
  submittedAt: string; status: 'pending' | 'approved' | 'rejected';
};
const devSafeSpotApplications: SafeSpotApplication[] = [
  { id: 'ss-app-1', name: 'Catahoula Coffee', address: '375 Bush St', city: 'San Francisco', type: 'cafe', contactEmail: 'hello@catahoula.com', contactName: 'Jordan T.', description: 'Quiet specialty coffee shop with private nooks and excellent lighting.', submittedAt: new Date(Date.now() - 2 * 86400_000).toISOString(), status: 'pending' },
];

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
  try {
    const rows = await getSafeSpots(query.city);
    res.json(
      rows.map((row) => ({
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
    if (process.env.NODE_ENV === "development") {
      const filtered = query.city
        ? DEV_SAFESPOTS.filter((s) => s.city.toLowerCase().includes(query.city!.toLowerCase()))
        : DEV_SAFESPOTS;
      res.json(filtered); return;
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
      // Dev fallback: serve fixture if available
      if (process.env.NODE_ENV === "development") {
        const fixture = DEV_SAFESPOTS.find((s) => s.id === id);
        if (fixture) { res.json(fixture); return; }
      }
      res.status(404).json({ error: "SafeSpot not found" }); return;
    }
    const row = rows[0];
    res.json({
      id: row.id,
      name: row.name,
      category: row.category,
      city: row.city,
      addressHint: row.address_hint,
      openLate: row.open_late,
    });
  } catch (err) {
    // Dev fallback: Supabase unavailable
    if (process.env.NODE_ENV === "development") {
      const fixture = DEV_SAFESPOTS.find((s) => s.id === id);
      if (fixture) { res.json(fixture); return; }
    }
    req.log.error({ err }, "Unable to read SafeSpot");
    res.status(503).json({ error: "SafeSpot temporarily unavailable" });
  }
});

// ---------------------------------------------------------------------------
// Companion payout setup — Stripe Connect Express onboarding
// ---------------------------------------------------------------------------

router.post("/companion/stripe/onboard", async (req, res) => {
  const companionId =
    getActorId(req, "companion");
  if (!companionId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();

    // Reuse existing account if already created (idempotent)
    let accountId = devCompanionStripeAccounts.get(companionId);
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        metadata: { companionId },
        capabilities: { transfers: { requested: true } },
      });
      accountId = account.id;
      devCompanionStripeAccounts.set(companionId, accountId);
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
    // Dev fallback: Stripe not connected — simulate onboarding by returning a dev URL
    if (process.env.NODE_ENV === "development") {
      devCompanionStripeAccounts.set(companionId, `dev-acct-${companionId}`);
      req.log.info({ companionId }, "Dev: Stripe Connect simulated — account created in-memory");
      // Return the dashboard back URL — companion returns "onboarded" immediately
      const origin = (req.headers["x-forwarded-proto"] ?? "https") + "://" + (req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost");
      const base = `${origin}${process.env.FRONTEND_BASE_PATH ?? "/onlyfavors"}`;
      res.json({ url: `${base}/dashboard/companion?stripe=return`, devSimulated: true }); return;
    }
    req.log.error({ err }, "Unable to create Stripe Connect onboarding link");
    res.status(500).json({ error: "Unable to start payout setup" });
  }
});

router.get("/companion/stripe/status", async (req, res) => {
  const companionId =
    getActorId(req, "companion");
  if (!companionId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const accountId = devCompanionStripeAccounts.get(companionId);
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
    // Dev fallback: Stripe not connected — infer status from in-memory account map
    if (process.env.NODE_ENV === "development") {
      const devAccountId = devCompanionStripeAccounts.get(companionId);
      if (devAccountId) {
        res.json({ status: "active", accountId: devAccountId, detailsSubmitted: true, payoutsEnabled: true, devSimulated: true }); return;
      }
      res.json({ status: "not_started" }); return;
    }
    req.log.error({ err }, "Unable to retrieve Stripe Connect account status");
    res.status(500).json({ error: "Unable to check payout status" });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapCompanionRow(row: {
  id: string;
  display_name: string;
  city: string;
  service_area: string;
  activities: string[];
  languages: string[];
  hourly_rate: number;
  response_time: string;
  rating: number;
  review_count: number;
  verified: boolean;
  instant_book: boolean;
  biography?: string | null;
  boundaries?: string[];
  photo_url?: string | null;
}) {
  return {
    id: row.id,
    displayName: row.display_name,
    city: row.city,
    serviceArea: row.service_area,
    activities: row.activities,
    languages: row.languages,
    hourlyRate: row.hourly_rate,
    responseTime: row.response_time,
    rating: row.rating,
    reviewCount: row.review_count,
    verified: row.verified,
    instantBook: row.instant_book,
    biography: row.biography ?? null,
    boundaries: row.boundaries ?? [],
    photoUrl: row.photo_url ?? null,
  };
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
