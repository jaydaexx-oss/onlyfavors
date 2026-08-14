import { Router, type IRouter } from "express";
import { db, bookings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getStripePublishableKey } from "../lib/stripeClient";
import { logger } from "../lib/logger";
import { getActorId } from "../lib/auth";
import { maybeInstantConfirm, recordBookingEvent } from "../lib/bookingLifecycle";

const router: IRouter = Router();

const TERMINAL = new Set(["completed", "cancelled", "expired"]);

router.get("/stripe/config", async (_req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (err) {
    logger.warn({ err }, "Stripe publishable key unavailable");
    res.status(503).json({ error: "Stripe configuration is temporarily unavailable" });
  }
});

export async function handlePaymentEvent(
  eventType: string,
  paymentIntentId: string,
  metadata: Record<string, string>,
  piStatus?: string,
): Promise<void> {
  const { bookingId, type: piType } = metadata;
  if (!bookingId) return;

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return;
  if (TERMINAL.has(booking.status) || booking.status === "expired") return;

  const now = new Date();

  if (piType === "deposit" && eventType === "payment_intent.succeeded") {
    if (booking.status === "requested") {
      await db
        .update(bookings)
        .set({
          status: "deposit_paid",
          depositPaidAt: now,
          holdExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(bookings.id, bookingId));
      await recordBookingEvent({
        bookingId,
        fromStatus: booking.status,
        toStatus: "deposit_paid",
        note: "deposit_succeeded",
      });
      logger.info({ bookingId, piId: paymentIntentId }, "Deposit confirmed by webhook — chat unlocked");
    }
    await maybeInstantConfirm(bookingId);
    return;
  }

  if (piType !== "full_payment") {
    if (
      eventType === "payment_intent.payment_failed" ||
      eventType === "payment_intent.canceled"
    ) {
      logger.warn({ bookingId, piId: paymentIntentId, eventType }, "Payment intent not successful");
    }
    return;
  }

  const capturable =
    eventType === "payment_intent.amount_capturable_updated" ||
    piStatus === "requires_capture";

  if (capturable && !["authorized", "completed"].includes(booking.status)) {
    await maybeInstantConfirm(bookingId);
    const [latest] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (latest && ["confirmed", "authorized"].includes(latest.status)) {
      await db
        .update(bookings)
        .set({
          status: "authorized",
          authorizedAt: now,
          fullPaymentIntentId: paymentIntentId,
          updatedAt: now,
        })
        .where(eq(bookings.id, bookingId));
      if (latest.status !== "authorized") {
        await recordBookingEvent({
          bookingId,
          fromStatus: latest.status,
          toStatus: "authorized",
          note: "full_payment_capturable",
        });
      }
      logger.info({ bookingId, piId: paymentIntentId }, "Full payment authorized — awaiting capture on complete");
    }
    return;
  }

  if (eventType === "payment_intent.succeeded") {
    // Manual capture succeeds after complete(). Do not overwrite completed.
    logger.info({ bookingId, piId: paymentIntentId, status: booking.status }, "Full payment captured");
    return;
  }

  if (
    eventType === "payment_intent.payment_failed" ||
    eventType === "payment_intent.canceled"
  ) {
    logger.warn({ bookingId, piId: paymentIntentId, eventType }, "Payment intent not successful");
  }
}

router.get("/stripe/booking/:id/status", async (req, res) => {
  const { id } = req.params;
  const customerId = getActorId(req, "customer");
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
    // Read-only. Stripe.js success must not confirm a booking — only the signed webhook writes status.
    res.json({ bookingId: id, status: booking.status, holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null });
  } catch (err: any) {
    logger.error({ err }, "Unable to fetch booking status");
    res.status(500).json({ error: "Unable to check payment status" });
  }
});

export default router;
