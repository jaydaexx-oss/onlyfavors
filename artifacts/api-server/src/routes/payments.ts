/**
 * Payment routes: Stripe Connect onboarding for companions and booking checkout.
 *
 * All Stripe IDs are kept server-side and never returned to the browser.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { companionStripeAccountsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { getApprovedCompanion } from "../lib/supabase";
import { z } from "zod";

const router: IRouter = Router();

const ConnectOnboardBody = z.object({
  companionId: z.string().min(1),
  returnUrl: z.string().url(),
  refreshUrl: z.string().url(),
});

/**
 * POST /api/connect/onboard
 *
 * Creates or resumes a Stripe Connect Express onboarding session for an
 * approved companion.  Returns a short-lived account-link URL; the companion
 * is redirected there to complete KYC / payout setup.
 *
 * Requires: authenticated session whose user ID matches the companionId.
 * Full auth (JWT / session) is enforced once Task 1 (auth) lands.
 */
router.post("/connect/onboard", async (req, res) => {
  // ── Auth: verified companion session required ────────────────────────────
  const sessionUserId = (req as any).user?.id as string | undefined;
  if (!sessionUserId) {
    res.status(401).json({ error: "Authentication required to configure payout settings" });
    return;
  }

  const parse = ConnectOnboardBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: "Invalid request body", details: parse.error.flatten() });
    return;
  }

  const { companionId, returnUrl, refreshUrl } = parse.data;

  // ── Ownership: caller must be the companion they are setting up ──────────
  if (sessionUserId !== companionId) {
    res.status(403).json({ error: "You may only configure your own payout settings" });
    return;
  }

  // ── URL allowlist: prevent attacker-controlled redirect destinations ─────
  const appDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0] ?? "";
  const appOrigin = appDomain ? `https://${appDomain}` : "";
  // Validate by exact parsed origin to prevent prefix attacks like
  // https://<app-domain>.attacker.example
  const isAllowed = (u: string) => {
    try {
      return appOrigin !== "" && new URL(u).origin === appOrigin;
    } catch {
      return false;
    }
  };
  if (!isAllowed(returnUrl) || !isAllowed(refreshUrl)) {
    res.status(400).json({ error: "Redirect URLs must point to the OnlyFavors application" });
    return;
  }

  // Companion must be approved in Supabase before receiving payouts
  const [companion] = await getApprovedCompanion(companionId).catch(() => []);
  if (!companion) {
    res.status(403).json({ error: "Companion not found or not approved" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();

    // Look up an existing Connect account for this companion
    const [existing] = await db
      .select()
      .from(companionStripeAccountsTable)
      .where(eq(companionStripeAccountsTable.companionId, companionId));

    let stripeAccountId: string;

    if (existing) {
      stripeAccountId = existing.stripeAccountId;
    } else {
      // Create a new Express Connect account — Stripe manages KYC and payouts
      const account = await stripe.accounts.create({
        type: "express",
        metadata: { companionId },
      });
      stripeAccountId = account.id;

      await db.insert(companionStripeAccountsTable).values({
        companionId,
        stripeAccountId,
        onboardingComplete: false,
      });
    }

    // Generate a short-lived account-link URL for the onboarding flow
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    req.log.info({ companionId }, "Stripe Connect onboarding link issued");
    res.status(201).json({ url: accountLink.url });
  } catch (err) {
    req.log.error({ err }, "Failed to create Stripe Connect onboarding link");
    res.status(503).json({ error: "Payout setup is temporarily unavailable" });
  }
});

/**
 * GET /api/connect/status/:companionId
 *
 * Returns whether a companion has completed Connect onboarding.
 * Refreshes the onboarding_complete flag from Stripe on each call.
 */
router.get("/connect/status/:companionId", async (req, res) => {
  const { companionId } = req.params;

  const [record] = await db
    .select()
    .from(companionStripeAccountsTable)
    .where(eq(companionStripeAccountsTable.companionId, companionId));

  if (!record) {
    res.json({ connected: false, onboardingComplete: false });
    return;
  }

  try {
    // Refresh status from Stripe if not yet marked complete
    if (!record.onboardingComplete) {
      const stripe = await getUncachableStripeClient();
      const account = await stripe.accounts.retrieve(record.stripeAccountId);
      const complete = Boolean(account.charges_enabled && account.payouts_enabled);

      if (complete) {
        await db
          .update(companionStripeAccountsTable)
          .set({ onboardingComplete: true, updatedAt: new Date() })
          .where(eq(companionStripeAccountsTable.companionId, companionId));
      }

      res.json({ connected: true, onboardingComplete: complete });
      return;
    }

    res.json({ connected: true, onboardingComplete: record.onboardingComplete });
  } catch (err) {
    req.log.error({ err }, "Failed to retrieve Stripe Connect account status");
    res.status(503).json({ error: "Connect status temporarily unavailable" });
  }
});

export default router;
