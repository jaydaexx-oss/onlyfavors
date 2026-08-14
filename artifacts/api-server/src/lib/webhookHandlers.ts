import { getStripeSync, getUncachableStripeClient, getStripeWebhookSecret } from "./stripeClient";
import { handlePaymentEvent } from "../routes/stripe";
import { logger } from "./logger";

export class WebhookHandlers {
  static async processWebhook(
    payload: Buffer,
    signature: string,
  ): Promise<void> {
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

    // 1. Run the StripeSync data sync (mirrors Stripe objects to local DB)
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // 2. Handle business logic — update booking status based on payment events
    try {
      const stripe = await getUncachableStripeClient();
      const webhookSecret = await getStripeWebhookSecret();
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );

      if (
        event.type === "payment_intent.succeeded" ||
        event.type === "payment_intent.payment_failed" ||
        event.type === "payment_intent.canceled" ||
        event.type === "payment_intent.amount_capturable_updated"
      ) {
        const pi = event.data.object as {
          id: string;
          status?: string;
          metadata: Record<string, string>;
        };
        await handlePaymentEvent(event.type, pi.id, pi.metadata ?? {}, pi.status);
      }
    } catch (err) {
      logger.error({ err }, "Webhook business logic error");
      throw err;
    }
  }
}
