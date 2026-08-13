---
name: OnlyFavors dev fallbacks
description: Rules for which API endpoints need explicit NODE_ENV===development fallbacks so Supabase 503s don't reach the browser during dev.
---

## Rule
Every list/query endpoint must have a `catch` block that, in development, serves in-memory fixture data rather than returning 503.

**Why:** Supabase tables don't exist until Task #1 (auth + schema) lands. Without fallbacks, React Query sees 503, enters error state, and the UI shows broken pages in dev. With fallbacks, the dev experience is indistinguishable from production.

**How to apply:** Any new `router.get(...)` that queries Supabase needs:
```typescript
} catch (err) {
  if (process.env.NODE_ENV === "development") {
    res.json(DEV_FIXTURES); return;
  }
  res.status(503).json({ error: "..." });
}
```

## Endpoints that have fallbacks (as of Aug 2026)
- `GET /companions` → `Object.values(DEV_COMPANIONS)` (with filter logic)
- `GET /companions/:id` → `DEV_COMPANIONS[id]`
- `GET /safespots` → `DEV_SAFESPOTS` array (city-filtered)
- `GET /companion/earnings` → entirely in-memory (no Supabase query)
- `GET /notifications` → in-memory `devNotifications`
- `GET /bookings` → in-memory `devBookings`

## Frontend counterpart
React Query hooks on list endpoints must use `retry: false` so they fail fast when Supabase 503s, allowing the API's dev fallback to respond immediately without multiple retry cycles keeping the UI in loading state.
