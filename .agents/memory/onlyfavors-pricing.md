---
name: OnlyFavors pricing model
description: Server-enforced pricing constants and calculation — never trust browser amounts
---

## The rule
All price calculation happens in `artifacts/api-server/src/lib/pricing.ts`. The browser never supplies amounts and must never be trusted for them.

**Constants (confirmed by product):**
- `CUSTOMER_FEE_PERCENT = 5` — safety-and-service fee added on top for the customer
- `COMPANION_COMMISSION_PERCENT = 15` — taken from companion's subtotal
- `DEPOSIT_CENTS = 1_000` — $10 refundable deposit, credited toward final booking

**Example: $100 favor (1 hour at $100/hr)**
| | Cents |
|---|---|
| Subtotal | 10_000 |
| Customer fee (5%) | 500 |
| Customer pays | 10_500 |
| Companion receives | 8_500 |
| Platform gross | 2_000 |

**Why:** Companion payout and platform revenue must be calculated server-side so neither party can manipulate the amounts. Stripe `application_fee_amount` is set from `platformRevenueCents`.

**How to apply:**
- Any endpoint that touches money must import `calculatePrice` from `pricing.ts`.
- The `GET /bookings/quote` endpoint is public and calls this before auth; booking creation and payment endpoints require auth.
- The $10 deposit Stripe PaymentIntent is separate from the full payment intent. Both use server-calculated amounts.
- Companion Stripe Connect payout (transfer_data.destination) is pending until companion onboarding is live (Task #1/auth).
