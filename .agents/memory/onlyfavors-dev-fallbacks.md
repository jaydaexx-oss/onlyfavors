---
name: OnlyFavors dev fallbacks
description: Empty-DB honesty. Missing tables return empty lists or 404, never invented people, venues, reviews, or metrics.
---

## Rule
Empty database → empty states. Do **not** seed Maya, Jordan, Sam, Catahoula Coffee, fake ratings, or vanity metrics when Supabase/Postgres tables are missing.

**Why:** Approving a fixture companion from admin, or showing invented profiles on the homepage, is a go-live hazard. The product must look empty until real applications are approved.

**How to apply:** List/query endpoints that fail because a table is missing should return `[]` or `404`. In-memory stores used when tables are missing must **start empty** so only real POSTs appear.

```typescript
} catch (err) {
  if (isMissingTableError(err)) {
    res.json([]); return;
  }
  res.status(503).json({ error: "..." });
}
```

Keep in-memory maps (`DEV_BOOKING_FIXTURES`, `DEV_COMPANION_APPLICATIONS`, `devReviews`, `devSafeSpotApplications`) as empty stores so a real create in development still works. Do not pre-fill them.

## Payments
Never mark a booking `deposit_paid` or `authorized`, and never mark Stripe Connect `active`, without a real Stripe response. Missing Stripe keys → 503. Do not return `devSimulated: true`.

## Auth
`getActorId` returns the signed-in account only. Never impersonate `dev-preview-customer` or `dev-preview-companion`. Companion routes require an `account_roles` companion role and a real `companion_profiles` row — do not stub a profile whose `id` is the account id.

## MVP freeze
See `onlyfavors-mvp-freeze.md`. Do not add deferred features (memberships, gifts, AI matching, social feeds). Close listed gaps only.

## Copy that must stay honest
- Membership: Explorer is live. Insider / Founding Friend / 14-day trials are not billed.
- Data export: only prefs, local saved IDs, and signed-in bookings. No fake “email within 24 hours.”
- No invented hourly-rate advisor, city averages, or “Est. next Friday” payout dates.
- No 24/7 staffing, insurance, or published response-time SLAs unless they exist in ops.
- Companion dashboard must not show profile views as a live metric (always 0). Use reviews or omit.

- Companions in Explore are human-approved listings. Do not claim government ID upload, third-party background checks, or identity verification products that are not built.
- Do not publish 3–5 day application SLAs, 48-hour cancellation refund rules, or automatic Stripe refunds. Cancel marks status only.
- Careers is email-only. No fake ATS, Series A, or headcount.
- Trust Circle SMS, hourly missed-check-in alerts, and venue QR staff flows are not live.
- Account deletion is email to hello@onlyfavors.com, not an in-app wipe.

## Do not reintroduce
- `DEV_COMPANIONS` named profiles
- Seeded admin applications (Maya / Jordan / Sam)
- Seeded SafeSpot directory or venue applications
- Seeded reviews or booking fixtures with invented customer IDs
- Completing an unknown booking ID in development (must 404)
