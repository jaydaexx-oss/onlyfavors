import {
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Bookings table — all pricing columns are server-calculated and immutable
 * after creation. The browser never supplies amounts.
 */
export const bookings = pgTable("bookings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  // Parties — populated from server-verified session once auth is live
  customerId: text("customer_id").notNull(),
  companionId: text("companion_id").notNull(),

  // Booking details
  activity: text("activity").notNull(),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  durationHours: numeric("duration_hours").notNull(),
  safeSpotId: text("safe_spot_id"),

  // Lifecycle
  status: text("status").notNull().default("draft"),

  // Pricing — written once from server-side pricing.ts, never updated
  subtotalCents: integer("subtotal_cents").notNull(),
  customerFeeCents: integer("customer_fee_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  companionPayoutCents: integer("companion_payout_cents").notNull(),
  platformRevenueCents: integer("platform_revenue_cents").notNull(),

  // Deposit — $10 refundable, credited toward final booking
  depositCents: integer("deposit_cents").notNull().default(1000),
  depositPaymentIntentId: text("deposit_payment_intent_id"),
  depositPaidAt: timestamp("deposit_paid_at"),

  // Full payment
  fullPaymentIntentId: text("full_payment_intent_id"),
  authorizedAt: timestamp("authorized_at"),
  confirmedAt: timestamp("confirmed_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

/**
 * Favor Requests — structured pre-booking contact (free, no chat unlocked).
 * Only structured fields allowed to reduce harassment and spam.
 */
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
