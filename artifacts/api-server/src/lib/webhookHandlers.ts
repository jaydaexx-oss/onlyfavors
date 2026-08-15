import { getStripeSync } from "./stripeClient";
import { db } from "@workspace/db";
import { bookingsTable } from "@workspace/db/schema";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { logger } from "./logger";

// Valid terminal statuses — these must never be overwritten by replayed or
// out-of-order webhook events.
const TERMINAL_STATUSES = ["completed", "cancelled"] as const;

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "Received type: " +
          typeof payload +
          ". " +
          "This usually means express.json() parsed the body before reaching this handler. " +
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    // Let stripe-replit-sync verify the signature and sync to the stripe schema
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Parse event for our custom booking state machine
    // (safe after processWebhook: signature is already verified above)
    try {
      const rawEvent = JSON.parse(payload.toString("utf8")) as {
        type: string;
        data?: { object?: { id?: string; metadata?: Record<string, string> } };
      };
      await WebhookHandlers.handleBookingEvent(rawEvent);
    } catch (err) {
      // Custom handler errors must not surface a 4xx to Stripe — it would retry.
      // Errors are logged; the next Stripe retry will re-invoke this handler.
      logger.error({ err }, "Custom booking event handler error");
    }
  }

  /**
   * Maps Stripe PaymentIntent events to booking status transitions.
   *
   * Two-PI lifecycle:
   *   depositPaymentIntentId  — $10 deposit PI (no Connect routing)
   *   fullPaymentIntentId     — full balance PI (manual capture, Connect routed)
   *
   * State machine (strictly enforced — status guards prevent replays/out-of-order):
   *   payment_intent.succeeded         (deposit PI) → deposit_paid
   *     allowed from: requested
   *   payment_intent.amount_capturable_updated (full PI) → authorized
   *     allowed from: requested, deposit_paid
   *   payment_intent.succeeded         (full PI, after capture) → completed
   *     allowed from: authorized, confirmed  (companion may accept before capture)
   *   payment_intent.canceled / failed (FULL PI ONLY) → cancelled
   *     allowed from: any non-terminal status
   *
   * IMPORTANT: Deposit PI cancellations do NOT trigger booking cancellation.
   * The authorize endpoint intentionally cancels any open deposit PI before
   * creating the full PI. Treating that as a booking cancellation would race
   * with the newly created full PI.
   */
  private static async handleBookingEvent(event: {
    type: string;
    data?: { object?: { id?: string; metadata?: Record<string, string> } };
  }): Promise<void> {
    const obj = event.data?.object;
    const paymentIntentId = obj?.id;
    if (!paymentIntentId) return;

    if (event.type === "payment_intent.succeeded") {
      // Deposit PI succeeded → deposit_paid (only from requested state)
      const depositRows = await db
        .update(bookingsTable)
        .set({ status: "deposit_paid", depositPaidAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(bookingsTable.depositPaymentIntentId, paymentIntentId),
            eq(bookingsTable.status, "requested"),
          ),
        )
        .returning({ id: bookingsTable.id });

      if (depositRows.length > 0) {
        logger.info(
          { bookingId: depositRows[0]?.id, paymentIntentId },
          "Booking deposit paid",
        );
        return;
      }

      // Full payment PI succeeded (fires after capture for manual-capture PIs).
      // Allowed from authorized OR confirmed (companion may accept before capture).
      const fullRows = await db
        .update(bookingsTable)
        .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(bookingsTable.fullPaymentIntentId, paymentIntentId),
            inArray(bookingsTable.status, ["authorized", "confirmed"]),
          ),
        )
        .returning({ id: bookingsTable.id });

      if (fullRows.length > 0) {
        logger.info(
          { bookingId: fullRows[0]?.id, paymentIntentId },
          "Booking payment captured — completed",
        );
      }

    } else if (event.type === "payment_intent.amount_capturable_updated") {
      // Customer confirmed the full-payment PI → authorized
      // Funds are held; companion must confirm via /capture before money moves.
      // Allowed from: requested or deposit_paid (both paths lead here)
      const rows = await db
        .update(bookingsTable)
        .set({ status: "authorized", authorizedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(bookingsTable.fullPaymentIntentId, paymentIntentId),
            inArray(bookingsTable.status, ["requested", "deposit_paid"]),
          ),
        )
        .returning({ id: bookingsTable.id });

      if (rows.length > 0) {
        logger.info(
          { bookingId: rows[0]?.id, paymentIntentId },
          "Booking authorized — awaiting companion confirmation and capture",
        );
      }

    } else if (
      event.type === "payment_intent.canceled" ||
      event.type === "payment_intent.payment_failed"
    ) {
      // Only cancel booking when the FULL payment PI fails/is cancelled.
      // Deposit PI cancellations are intentional — the authorize endpoint cancels
      // the deposit PI before creating the full PI. Triggering a booking
      // cancellation on that would race with the newly created full PI.
      const rows = await db
        .update(bookingsTable)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(bookingsTable.fullPaymentIntentId, paymentIntentId), // full PI only
            notInArray(bookingsTable.status, [...TERMINAL_STATUSES]),
          ),
        )
        .returning({ id: bookingsTable.id });

      if (rows.length > 0) {
        logger.info(
          { bookingId: rows[0]?.id, paymentIntentId, eventType: event.type },
          "Booking cancelled via webhook (full PI cancelled/failed)",
        );
      }
    }
  }
}
