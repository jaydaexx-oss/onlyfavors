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
import { db, bookings, favorRequests } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getApprovedCompanion,
  getApprovedCompanions,
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

router.get("/admin/overview", (req, res) => {
  req.log.warn("Admin overview requires server-verified admin role");
  res.status(401).json({ error: "Authentication required" });
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
