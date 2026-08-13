import { Router, type IRouter } from "express";
import { db, bookings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getStripePublishableKey, getUncachableStripeClient } from "../lib/stripeClient";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /stripe/config — publishable key (safe for client, never the secret key)
// ---------------------------------------------------------------------------
router.get("/stripe/config", async (_req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (err) {
    logger.warn({ err }, "Stripe publishable key unavailable");
    res.status(503).json({ error: "Stripe configuration is temporarily unavailable" });
  }
});

// ---------------------------------------------------------------------------
// POST /stripe/payment-event — called internally after webhook verification
// Updates booking status based on payment_intent events.
// This is NOT a public endpoint — it is called from app.ts webhook handler.
// ---------------------------------------------------------------------------
export async function handlePaymentEvent(
  eventType: string,
  paymentIntentId: string,
  metadata: Record<string, string>,
): Promise<void> {
  const { bookingId, type: piType } = metadata;
  if (!bookingId) return;

  if (eventType === "payment_intent.succeeded") {
    const now = new Date();
    if (piType === "deposit") {
      await db
        .update(bookings)
        .set({ status: "deposit_paid", depositPaidAt: now, updatedAt: now })
        .where(eq(bookings.id, bookingId));
      logger.info({ bookingId, piId: paymentIntentId }, "Deposit confirmed — chat unlocked");
    } else if (piType === "full_payment") {
      await db
        .update(bookings)
        .set({ status: "confirmed", confirmedAt: now, updatedAt: now })
        .where(eq(bookings.id, bookingId));
      logger.info({ bookingId, piId: paymentIntentId }, "Full payment confirmed — booking confirmed");
    }
  } else if (
    eventType === "payment_intent.payment_failed" ||
    eventType === "payment_intent.canceled"
  ) {
    logger.warn({ bookingId, piId: paymentIntentId, eventType }, "Payment intent not successful");
    // Do not cancel the booking — the customer may retry
  }
}

// ---------------------------------------------------------------------------
// GET /stripe/booking/:id/status — polling endpoint for payment status
// After Stripe redirects back, the frontend polls this to get the current
// booking status without requiring a webhook to have fired first.
// ---------------------------------------------------------------------------
router.get("/stripe/booking/:id/status", async (req, res) => {
  const { id } = req.params;
  // Auth check — only the booking owner should poll this
  const customerId = (req as any).user?.id ??
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

    // If the booking still shows as pre-payment, check Stripe directly
    // (webhook may not have fired yet)
    if (
      booking.status === "requested" &&
      (booking.depositPaymentIntentId || booking.fullPaymentIntentId)
    ) {
      try {
        const stripe = await getUncachableStripeClient();
        const piId = booking.fullPaymentIntentId ?? booking.depositPaymentIntentId!;
        const pi = await stripe.paymentIntents.retrieve(piId);

        if (pi.status === "succeeded") {
          const piType = pi.metadata?.type;
          await handlePaymentEvent("payment_intent.succeeded", pi.id, pi.metadata as Record<string, string>);
          // Re-fetch the updated booking
          const [updated] = await db.select().from(bookings).where(eq(bookings.id, id));
          if (updated) {
            res.json({ bookingId: id, status: updated.status });
            return;
          }
        }
      } catch (stripeErr) {
        logger.warn({ stripeErr }, "Could not verify payment status from Stripe — returning cached status");
      }
    }

    res.json({ bookingId: id, status: booking.status });
  } catch (err) {
    logger.error({ err }, "Unable to fetch booking status");
    res.status(500).json({ error: "Unable to check payment status" });
  }
});

export default router;
