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
import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  getApprovedCompanion,
  getApprovedCompanions,
  getSafeSpot,
  getSafeSpots,
} from "../lib/supabase";
import { calculatePrice } from "../lib/pricing";
import { getUncachableStripeClient } from "../lib/stripeClient";

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
    req.log.error({ err }, "Unable to read approved companions");
    res
      .status(503)
      .json({ error: "Companion directory is temporarily unavailable" });
  }
});

router.get("/companions/:id", async (req, res) => {
  const { id } = GetCompanionParams.parse(req.params);
  try {
    const [row] = await getApprovedCompanion(id);
    if (!row) {
      res.status(404).json({ error: "Companion not found" });
      return;
    }
    res.json(mapCompanionRow(row));
  } catch (err) {
    req.log.error({ err }, "Unable to read companion profile");
    res
      .status(503)
      .json({ error: "Companion profile is temporarily unavailable" });
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
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-customer" : null);
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
    req.log.error({ err }, "Unable to create booking intent");
    res.status(500).json({ error: "Unable to create booking" });
  }
});

router.get("/bookings", async (req, res) => {
  const customerId =
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-customer" : null);
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
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Unable to list bookings");
    res.status(503).json({ error: "Bookings temporarily unavailable" });
  }
});

router.get("/bookings/:id", async (req, res) => {
  const { id } = req.params;
  const customerId =
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-customer" : null);
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
    if (isMissingTableError(err)) { res.status(404).json({ error: "Booking not found" }); return; }
    req.log.error({ err }, "Unable to load booking");
    res.status(503).json({ error: "Booking temporarily unavailable" });
  }
});

router.post("/bookings/:id/deposit", async (req, res) => {
  const { id } = AuthorizeDepositParams.parse(req.params);
  const customerId =
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-customer" : null);
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
    req.log.error({ err }, "Unable to create deposit payment intent");
    res.status(500).json({ error: "Unable to initiate deposit" });
  }
});

router.post("/bookings/:id/authorize", async (req, res) => {
  const { id } = AuthorizeFullPaymentParams.parse(req.params);
  const customerId =
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-customer" : null);
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
    req.log.error({ err }, "Unable to create full payment intent");
    res.status(500).json({ error: "Unable to initiate payment" });
  }
});

// ---------------------------------------------------------------------------
// Companion booking inbox — view, accept, decline requests
// ---------------------------------------------------------------------------

router.get("/companion/bookings", async (req, res) => {
  const companionId =
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-companion" : null);
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const rows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.companionId, companionId))
      .orderBy(desc(bookings.createdAt));
    res.json(rows.map(formatBookingFull));
  } catch (err: any) {
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Unable to list companion bookings");
    res.status(503).json({ error: "Bookings temporarily unavailable" });
  }
});

router.get("/companion/bookings/:id", async (req, res) => {
  const { id } = req.params;
  const companionId =
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-companion" : null);
  if (!companionId) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!booking || booking.companionId !== companionId) {
      res.status(404).json({ error: "Booking not found" }); return;
    }
    res.json({ ...formatBookingFull(booking), viewerRole: "companion" });
  } catch (err: any) {
    if (isMissingTableError(err)) { res.status(404).json({ error: "Booking not found" }); return; }
    req.log.error({ err }, "Unable to load companion booking");
    res.status(503).json({ error: "Booking temporarily unavailable" });
  }
});

router.post("/bookings/:id/accept", async (req, res) => {
  const { id } = req.params;
  const companionId =
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-companion" : null);
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
    if (isMissingTableError(err)) { res.status(503).json({ error: "Service temporarily unavailable" }); return; }
    req.log.error({ err }, "Unable to accept booking");
    res.status(503).json({ error: "Could not accept booking" });
  }
});

router.post("/bookings/:id/decline", async (req, res) => {
  const { id } = req.params;
  const companionId =
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-companion" : null);
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
    if (isMissingTableError(err)) { res.status(503).json({ error: "Service temporarily unavailable" }); return; }
    req.log.error({ err }, "Unable to decline booking");
    res.status(503).json({ error: "Could not decline booking" });
  }
});

// ---------------------------------------------------------------------------
// Structured Favor Requests — free, no chat until deposit paid
// ---------------------------------------------------------------------------

router.post("/favor-requests", async (req, res) => {
  const body = CreateFavorRequestBody.parse(req.body);
  const customerId =
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-customer" : null);
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
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-customer" : null);
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
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-companion" : null);
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
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-customer" : null);
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
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-customer" : null);
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
// Admin / ops — restricted to trust staff
// ---------------------------------------------------------------------------

const DEV_COMPANION_APPLICATIONS = [
  { id: "app-001", displayName: "Maya R.", city: "San Francisco", activities: ["Museum visits", "Coffee conversations", "Farmers market walks"], languages: ["English", "Spanish"], hourlyRate: 65, applicationDate: "2026-08-10", bio: "Retired curator with a love for contemporary art and good conversation. Patient, warm, and genuinely curious about people.", status: "pending" },
  { id: "app-002", displayName: "Jordan K.", city: "New York", activities: ["Gallery tours", "Cooking classes", "Evening walks"], languages: ["English", "French"], hourlyRate: 75, applicationDate: "2026-08-11", bio: "Former chef turned food writer. Best company for anyone who takes eating seriously.", status: "pending" },
  { id: "app-003", displayName: "Sam T.", city: "Chicago", activities: ["Board games", "Book clubs", "City tours"], languages: ["English"], hourlyRate: 55, applicationDate: "2026-08-12", bio: "Professional librarian who knows every good spot in the city. Quiet energy, great listener.", status: "pending" },
];

router.get("/admin/overview", async (req, res) => {
  try {
    let activeBookings = 0;
    try {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(inArray(bookings.status, ["deposit_paid", "authorized", "confirmed"]));
      activeBookings = Number(rows[0]?.count ?? 0);
    } catch (err: any) {
      if (!isMissingTableError(err)) throw err;
    }
    res.json({
      verificationQueue: process.env.NODE_ENV === "development" ? DEV_COMPANION_APPLICATIONS.length : 0,
      openReports: 0,
      activeBookings,
      checkInsDue: 0,
    });
  } catch (err) {
    req.log.error({ err }, "Admin overview failed");
    res.status(503).json({ error: "Overview temporarily unavailable" });
  }
});

router.get("/admin/companions/pending", (_req, res) => {
  if (process.env.NODE_ENV === "development") {
    res.json(DEV_COMPANION_APPLICATIONS);
    return;
  }
  res.json([]);
});

router.post("/admin/companions/:id/approve", (req, res) => {
  const { id } = req.params;
  req.log.info({ id }, "Companion approved");
  res.json({ id, status: "approved" });
});

router.post("/admin/companions/:id/reject", (req, res) => {
  const { id } = req.params;
  req.log.info({ id }, "Companion rejected");
  res.json({ id, status: "rejected" });
});

router.get("/admin/bookings/recent", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(bookings)
      .orderBy(desc(bookings.createdAt))
      .limit(20);
    res.json(rows.map(formatBookingFull));
  } catch (err: any) {
    if (isMissingTableError(err)) { res.json([]); return; }
    req.log.error({ err }, "Admin bookings failed");
    res.status(503).json({ error: "Bookings temporarily unavailable" });
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
        addressHint: row.address_hint,
        openLate: row.open_late,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Unable to read SafeSpots");
    res.status(503).json({ error: "SafeSpots are temporarily unavailable" });
  }
});

router.get("/safespots/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await getSafeSpot(id);
    if (!rows.length) { res.status(404).json({ error: "SafeSpot not found" }); return; }
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
    req.log.error({ err }, "Unable to read SafeSpot");
    res.status(503).json({ error: "SafeSpot temporarily unavailable" });
  }
});

// ---------------------------------------------------------------------------
// Companion payout setup — Stripe Connect Express onboarding
// ---------------------------------------------------------------------------

router.post("/companion/stripe/onboard", async (req, res) => {
  const companionId =
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-companion" : null);
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
    req.log.error({ err }, "Unable to create Stripe Connect onboarding link");
    res.status(500).json({ error: "Unable to start payout setup" });
  }
});

router.get("/companion/stripe/status", async (req, res) => {
  const companionId =
    (req as any).user?.id ??
    (process.env.NODE_ENV === "development" ? "dev-preview-companion" : null);
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

export default router;
