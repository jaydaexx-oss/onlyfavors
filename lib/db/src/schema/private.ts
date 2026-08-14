import { pgSchema, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Exact meeting coordinates and safety-plan details never belong on the
 * public schema. Access is server-only; values are stored encrypted.
 */
export const privateSchema = pgSchema("private");

export const exactLocations = privateSchema.table("exact_locations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  bookingId: text("booking_id").notNull(),
  ciphertext: text("ciphertext").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
