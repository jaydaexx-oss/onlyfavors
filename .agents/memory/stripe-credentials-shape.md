---
name: Stripe credentials shape
description: The Replit Stripe connector exposes credentials under a non-standard field name; also, stripe-replit-sync must be kept external from the esbuild bundle.
---

## Credential field names

The Replit Stripe connector (`connection:conn_stripe_*`) returns credentials via:

```
GET https://${REPLIT_CONNECTORS_HOSTNAME}/api/v2/connection?include_secrets=true&connector_names=stripe
```

Response shape:
```json
{
  "items": [{
    "settings": {
      "secret":       "<Stripe secret key>",   // NOT "secret_key"
      "publishable":  "<Stripe publishable key>",
      "account_id":   "acct_...",
      "mcp":          "...",
      "claim_url":    "..."
    }
  }]
}
```

**Why:** The Stripe skill's code template uses `settings.secret_key`, but the actual Replit connector returns `settings.secret`. The stripeClient.ts must fall back: `settings?.secret ?? settings?.secret_key`.

## esbuild must keep stripe-replit-sync external

Add `"stripe-replit-sync"` to the `external` array in `artifacts/api-server/build.mjs`.

**Why:** `stripe-replit-sync` reads SQL migration files from `./migrations` relative to its own `__dirname` at runtime. When esbuild bundles it, `__dirname` resolves to the build output directory and the migration files are not found, so `runMigrations()` creates the stripe schema but no tables.

## runMigrations schema parameter

Call `runMigrations({ databaseUrl })` — do NOT pass a `schema` option. The `MigrationConfig` type only accepts `{ databaseUrl: string }` and TypeScript will reject any additional property. stripe-replit-sync hardcodes the "stripe" schema internally.
