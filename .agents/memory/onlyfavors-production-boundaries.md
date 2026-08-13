---
name: OnlyFavors production boundaries
description: Durable trust and safety decisions for the OnlyFavors marketplace.
---

OnlyFavors should never manufacture companion profiles, admin metrics, SafeSpots, or booking states. Public reads may expose only approved records and approximate service areas; authenticated dashboards, exact locations, messages, and booking intents must fail closed until server-verified roles and the Supabase schema are ready.

**Why:** The product’s primary differentiator is privacy and trust, so a visually complete UI must not imply that operational data or payment flows are live when the connected service has no matching schema or authorization.

**How to apply:** Keep empty states and explicit service-unavailable states in the frontend, and keep sensitive fields out of public Supabase selects and browser responses.