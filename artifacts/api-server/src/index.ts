import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0)
  throw new Error(`Invalid PORT value: "${rawPort}"`);

// ─── Stripe initialisation (non-blocking) ────────────────────────────────────
// Runs after the server is listening so a Stripe credential failure does not
// prevent the public endpoints (discovery, safety) from responding.
async function initStripe(): Promise<void> {
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    const { getStripeSync } = await import("./lib/stripeClient");

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      logger.warn(
        "DATABASE_URL not set — skipping Stripe schema migrations and sync",
      );
      return;
    }

    logger.info("Initialising Stripe schema…");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();

    const webhookBase = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(
      `${webhookBase}/api/stripe/webhook`,
    );
    logger.info({ webhookBase }, "Stripe managed webhook configured");

    // Backfill in the background — don't await so startup stays fast
    stripeSync.syncBackfill().catch((err) => {
      logger.error({ err }, "Stripe backfill error");
    });
  } catch (err) {
    // Stripe init failure is logged but never fatal — public routes still work
    logger.warn(
      { err },
      "Stripe initialisation failed (payments unavailable until resolved)",
    );
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Fire-and-forget — public endpoints respond immediately
  initStripe().catch((err) => {
    logger.error({ err }, "Unhandled error in initStripe");
  });
});
