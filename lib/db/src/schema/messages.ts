import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Messages table — one thread per booking, gated behind deposit payment.
 * Phone numbers / emails stripped server-side before storage.
 */
export const messages = pgTable("messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  bookingId: text("booking_id").notNull(),
  senderId: text("sender_id").notNull(),
  senderRole: text("sender_role").notNull(), // 'customer' | 'companion'
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
