import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// --------------------------------------------------------------------------
// Bookings — all pricing is server-calculated; browser never supplies amounts
// --------------------------------------------------------------------------

export const bookingsTable = pgTable("bookings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // Parties — populated from server-verified session once auth is live
  customerId: text("customer_id"),
  companionId: text("companion_id").notNull(),

  // Booking details
  activity: text("activity").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  durationHours: numeric("duration_hours").notNull(),
  safeSpotId: text("safe_spot_id"),

  // Lifecycle
  status: text("status").notNull().default("draft"),

  // Pricing — written once from server-side pricing, never updated by client
  subtotalCents: integer("subtotal_cents").notNull(),
  // 5% customer-facing safety-and-service fee (from detailed pricing flow)
  customerFeeCents: integer("customer_fee_cents"),
  // 20% platform fee used in the Stripe PaymentIntent flow
  platformFeeCents: integer("platform_fee_cents"),
  totalCents: integer("total_cents").notNull(),
  // Companion receives subtotal minus 15% commission
  companionPayoutCents: integer("companion_payout_cents"),
  // Gross platform revenue = 5% customer fee + 15% companion commission
  platformRevenueCents: integer("platform_revenue_cents"),

  // Deposit — $10 refundable, credited toward final booking
  depositCents: integer("deposit_cents").notNull().default(1000),
  depositPaymentIntentId: text("deposit_payment_intent_id"),
  depositPaidAt: timestamp("deposit_paid_at"),

  // Full payment lifecycle
  fullPaymentIntentId: text("full_payment_intent_id"),
  authorizedAt: timestamp("authorized_at"),
  confirmedAt: timestamp("confirmed_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),

  // Stripe IDs — server-only, never returned to the browser
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeConnectAccountId: text("stripe_connect_account_id"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Alias for code that still uses the shorter name
export const bookings = bookingsTable;

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;

// --------------------------------------------------------------------------
// Companion Stripe Connect accounts
// --------------------------------------------------------------------------

export const companionStripeAccountsTable = pgTable(
  "companion_stripe_accounts",
  {
    companionId: text("companion_id").primaryKey(),
    stripeAccountId: text("stripe_account_id").notNull(),
    onboardingComplete: boolean("onboarding_complete").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
);

export type CompanionStripeAccount =
  typeof companionStripeAccountsTable.$inferSelect;

// --------------------------------------------------------------------------
// Favor Requests — structured pre-booking contact (free, no chat unlocked)
// Only structured fields allowed to reduce harassment and spam.
// --------------------------------------------------------------------------

export const favorRequests = pgTable("favor_requests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  customerId: text("customer_id").notNull(),
  companionId: text("companion_id").notNull(),
  activity: text("activity").notNull(),
  preferredDate: text("preferred_date").notNull(),
  preferredDurationHours: numeric("preferred_duration_hours").notNull(),
  // Structured fields only — no free-text contact info
  locationType: text("location_type"),
  accessibilityNeeds: text("accessibility_needs"),
  dressCode: text("dress_code"),
  additionalQuestions: text("additional_questions"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFavorRequestSchema = createInsertSchema(favorRequests).omit({
  id: true,
  createdAt: true,
});

export type InsertFavorRequest = z.infer<typeof insertFavorRequestSchema>;
export type FavorRequest = typeof favorRequests.$inferSelect;
