import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./lib/stripeClient";
import { runAppMigrations } from "@workspace/db/migrate";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0)
  throw new Error(`Invalid PORT value: "${rawPort}"`);

/**
 * Initialize the Stripe schema, managed webhook, and background data backfill.
 * Non-fatal: payment routes return 503 when Stripe isn't reachable, but all
 * other marketplace routes (discovery, safety, etc.) remain fully available.
 */
async function initStripe(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    logger.warn(
      "DATABASE_URL not set — skipping Stripe schema migrations and sync",
    );
    return;
  }

  // 1. Apply application schema migrations (bookings, companion_stripe_accounts, favor_requests).
  //    Idempotent — drizzle tracks applied migrations and skips them on re-runs.
  logger.info("Applying application schema migrations...");
  await runAppMigrations(databaseUrl);
  logger.info("Application schema ready");

  logger.info("Initializing Stripe schema...");
  // stripe-replit-sync is kept external in build.mjs so its SQL migration
  // files are accessible at runtime via their original disk path.
  // MigrationConfig only accepts { databaseUrl } — no schema option.
  await runMigrations({ databaseUrl });
  logger.info("Stripe schema ready");

  const stripeSync = await getStripeSync();

  // Register or find the managed webhook endpoint
  const webhookBaseUrl = `https://${process.env["REPLIT_DOMAINS"]?.split(",")[0]}`;
  const webhookEndpoint = await stripeSync.findOrCreateManagedWebhook(
    `${webhookBaseUrl}/api/stripe/webhook`,
  );
  logger.info({ webhookUrl: webhookEndpoint?.url }, "Stripe webhook configured");

  // Backfill existing Stripe data — fire-and-forget so startup stays fast
  stripeSync
    .syncBackfill()
    .then(() => {
      logger.info("Stripe data backfill complete");
    })
    .catch((err) => {
      logger.error({ err }, "Stripe data backfill error");
    });
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Non-blocking: start Stripe init after the server is accepting requests
  initStripe().catch((err) => {
    logger.warn(
      { err },
      "Stripe initialization failed — payment routes will be degraded",
    );
  });
});
