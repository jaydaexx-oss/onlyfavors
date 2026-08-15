import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";

/**
 * Fetches Stripe credentials from the Replit connection API.
 * Not cached -- tokens can rotate, so fetch fresh each time.
 *
 * The Replit Stripe connector exposes: { secret, publishable, account_id, ... }
 * Fall back to snake_case variants in case the shape changes.
 */
async function getStripeCredentials(): Promise<{
  secretKey: string;
  publishableKey?: string;
  webhookSecret?: string;
}> {
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Missing Replit environment variables. " +
        "Ensure the Stripe integration is connected via the Integrations tab.",
    );
  }

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!resp.ok) {
    throw new Error(
      `Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await resp.json()) as any;
  const item = data.items?.[0];
  const settings = item?.settings;

  // Diagnostics — log shape without values (keys only) so we can debug
  // credential fetch issues without exposing secrets in logs.
  if (!item) {
    throw new Error(
      `Stripe credentials response has no items. Top-level keys: ${Object.keys(data ?? {}).join(", ")}`,
    );
  }
  if (!settings) {
    throw new Error(
      `Stripe credentials item has no settings. Item keys: ${Object.keys(item ?? {}).join(", ")}`,
    );
  }

  // Connector returns `secret`, not `secret_key` — fall back to cover both shapes.
  const secretKey: string | undefined =
    settings?.secret ?? settings?.secret_key ?? settings?.secretKey;
  const publishableKey: string | undefined =
    settings?.publishable ?? settings?.publishable_key ?? settings?.publishableKey;
  const webhookSecret: string | undefined =
    settings?.webhook_secret ?? settings?.webhookSecret;

  if (!secretKey) {
    throw new Error(
      `Stripe integration missing secret key. Settings keys present: ${Object.keys(settings).join(", ")}`,
    );
  }

  return { secretKey, publishableKey, webhookSecret };
}

/**
 * Returns a fresh authenticated Stripe client.
 * Not cached -- fetches credentials on every call so rotated keys are picked up.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

/**
 * Returns the Stripe publishable key — safe to expose to the browser.
 */
export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getStripeCredentials();
  if (!publishableKey) {
    throw new Error(
      "Stripe publishable key not found in connector settings. " +
        "Ensure the Stripe integration is fully connected.",
    );
  }
  return publishableKey;
}

/**
 * Returns a fresh StripeSync instance for webhook processing and data sync.
 * Not cached -- fetches credentials on every call so rotated keys are picked up.
 */
export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}
