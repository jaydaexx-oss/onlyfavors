# OnlyFavors

OnlyFavors is a privacy-first marketplace for booking verified local companions for platonic activities with clear safety boundaries.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/onlyfavors/` — the responsive React + Vite product experience and all user-facing routes.
- `artifacts/api-server/src/routes/marketplace.ts` — fail-closed API boundary for discovery, safety resources, dashboards, and booking intents.
- `artifacts/api-server/src/lib/supabase.ts` — server-only Supabase REST access using the connected Replit connector.
- `lib/api-spec/openapi.yaml` — source of truth for generated API hooks and validation schemas.
- `lib/db/src/schema/` — reserved for application persistence when the production schema is established.

## Architecture decisions

- Public companion discovery exposes only approved records and approximate service areas.
- Unauthenticated dashboards and booking intents fail closed; they never return invented operational data.
- Safety guidance is available publicly, while operational records and exact locations stay behind protected server boundaries.
- The frontend uses generated API hooks from the OpenAPI contract rather than hand-written request types.

## Product

The first milestone includes the public home, companion discovery, profile and booking entry points, customer and companion workspaces, companion application, email-code login entry, safety center, policy pages, admin login, and protected operations route. The experience uses warm parchment, mulberry, and trust-green cues to communicate privacy and care without resembling a dating app or classifieds site.

## User preferences

- Keep the product clearly platonic and safety-forward.
- Never invent companion profiles, operational metrics, or locations when connected data is empty or unavailable.

## Gotchas

- Apply `supabase/migrations/0001_onlyfavors_core.sql` (or `pnpm --filter @workspace/db run push`) before discovery and auth can persist. Without `DATABASE_URL`, the API fails closed.
- Production OTP email requires `RESEND_API_KEY` and `AUTH_PEPPER`. Set `ADMIN_BOOTSTRAP_EMAIL` to grant the first admin role.
- Stripe works via the Replit connector or `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET`.
- This repo is Vite + Express, not Next.js. Deploying to Vercel requires a separate hosting adapter and must not expose service-role keys to the browser.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
