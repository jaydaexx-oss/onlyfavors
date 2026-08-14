---
name: OnlyFavors MVP freeze
description: Frozen pilot scope, policy decisions, and deferred work. Do not add features outside this list until the first city works end to end.
---

# MVP freeze — first pilot

Frozen **2026-08-14**. Do not add product surface until a verified adult can find, book, meet, pay, and get help in the launch city.

**Core test:** Can a verified customer safely find, book, meet, and pay a verified companion—and can both people get help when something goes wrong?

Stack stays Vite + React 19 + wouter + Express. Do not rewrite to Next.js.

## Frozen policies (pilot)

| Policy | Decision |
|---|---|
| Minimum booking | **1 hour**, steps of **0.5 hours**, max **8 hours**. Full-day is a **7-hour** booking using `dayRate` if set, else `hourlyRate × 7`. |
| Instant Book | **Off by default.** Companion must opt in. Default path is request → accept/decline. Instant Book still requires deposit + server quote and cannot overlap another confirmed booking. |
| Cancel / no-show | **Before accept:** full $10 deposit refund via Stripe. **≥24h before start (confirmed):** full refund of authorized amount. **<24h or customer no-show:** keep **$10** as a cancellation fee (platform, not companion); refund the rest if captured/authorized. **Companion cancel or no-show:** full customer refund, **$0** companion payout. Admin records disputes. |
| Payout release | Capture on **checkout/complete**. Companion is paid via Stripe Connect on Stripe’s schedule. Admin can **hold** payout before capture. No “next Friday” or 24-hour promise. |
| Precise location | Encrypted pin **readable for 24 hours** from last write, then unread. Delete ciphertext after expiry. Public APIs never return lat/lng. |
| Launch city | **New Orleans** only. Service area is a **neighborhood / ~15 mile** circle, never a live pin or home address. Other cities stay “not live.” |
| Customer verification | **Email OTP + 18+ attestation.** No customer ID upload for the pilot. |
| Companion identity | Application + **admin-reviewed ID** (status: `unsubmitted` / `pending` / `verified` / `rejected`). Third-party background check is **not** in the pilot. `approved` is what puts them in Explore. |
| Prohibited | Dating, sexual/escort services, minors, private residences as the meeting start, off-platform payment or contact, harassment, discrimination, coercion. First meeting starts at an approved **SafeSpot**. |

Pricing stays server-only: **5% customer fee**, **15% companion commission**, **$10 deposit** credited to the final total.

## In scope — customer

- Guest browse by **city or neighborhood** (New Orleans).
- Nearby **available** approved companions (availability windows, not invented “available today”).
- Filters: **date, time, activity, price, vibe** (vibe = activities + interview answers already on the profile).
- **Approved** companion profiles (human review). Do not claim government-ID product copy until identity status is real.
- Favor Request (structured, no chat).
- Booking + Stripe payment (deposit then authorize/capture).
- Booking-only masked chat (after **$10 deposit**). Phone/email stay hidden. **Do not promise end-to-end encryption** — staff must be able to review a reported thread.
- **Boundary Receipt:** both people sign a stored snapshot (activity, SafeSpot, time, transportation, contact, photos, alcohol, companion boundaries) before deposit / accept. Changing those details means a **new booking**. Apply SQL `0009`.
- Cancellation **and Stripe refund** per the table above.
- Trust Circle (max **3**) + check-in / checkout records. Contacts may get a **venue** check-in or missed-check-in notice if email is configured — **never** companion identity, full booking details, addresses, or live pins. SMS is in-scope **only as a real send or an honest “not configured” error**.
- Block, report, emergency copy that tells people to call **911** first; in-app report must persist.
- **Help me leave** during an active booking: directions to the listed SafeSpot, call a Trust Circle contact, stop ordinary location sharing after checkout. Do not fake a venue cancellation SMS or dispatch emergency services.
- Booking history and rebook (same companion, new request).

## In scope — companion

- Application + identity status for admin review.
- Profile: activities, boundaries, service area, photo.
- Hourly rate + optional full-day rate.
- Availability calendar (windows already persist).
- Accept, decline, Instant Book opt-in.
- Protected chat on paid bookings.
- Upcoming dashboard.
- Check-in and checkout.
- Earnings + payout history from **real** Stripe/booking rows.
- Customer report + block.

## In scope — admin

- Approve / reject companions.
- Review identity status.
- Manage users and bookings.
- Refunds, disputes, no-shows (execute Stripe refund / hold payout).
- Safety reports queue. Admin may **read a reported booking thread** (audited). Chat is not E2E.
- Suspend / ban.
- Hold companion payouts.
- Audit log on every sensitive action (`writeAudit` already exists — use it everywhere money, roles, or safety change).

## In scope — systems

- Double-booking prevention (overlap of confirmed/authorized bookings for the same companion).
- Time zones: store booking start as **city-local New Orleans (`America/Chicago`)** and display in that zone.
- Booking-state history (append-only status events, not just overwrite `status`).
- Neutral, privacy-safe notifications (no addresses, no exact pins, no “she’s here”).
- Data download (bookings + prefs; not messages/Trust Circle unless those tables are included honestly).
- Account deletion (real server path, not mailto-only theater).
- Rate limiting + bot protection (OTP already limited; extend to booking/report).
- Session management (existing sessions). Device list can wait if sessions can be revoked.
- Location expiry + deletion (24h).
- Payment webhook signature verification (fail closed).
- Human-readable errors and a next step (retry, email, sign in).

## Deferred until after the first working pilot

AI matching, paid memberships/subscriptions (Plus), gift cards, loyalty, referrals-with-credits, recurring bookings, venue partnership programs (staff training, discounts, emergency desks), social/community feeds, kudos, tips, compare-companions, city waitlists, careers ATS, press kits, newsletters, 14-day trials, invented SLAs, voice intros, Duo Favors, reliability scores, disappearing media, photo watermarks, concierge matching, selling “best match.”

SafeSpot in the pilot is a **listed public venue + QR/app check-in**. Do not claim venue staff awareness or partnerships until those exist.

Do not re-seed Maya/Jordan/Sam or fake SafeSpots.

## Build order after freeze (gaps only)

1. Ops: apply SQL `0001`–`0004`, env (`DATABASE_URL`, `AUTH_PEPPER`, `RESEND`, `ADMIN_BOOTSTRAP_EMAIL`, `LOCATION_ENCRYPTION_KEY`, Stripe).
2. Money path: webhook verify, real refunds, capture-on-complete, payout hold.
3. Safety path: identity status, block, Trust Circle notify-or-fail-closed, check-in/out.
4. Integrity: overlap prevention, timezone, booking events, account delete.
5. Discovery: New Orleans-only browse + real availability filters.

If a request is not in this file, the answer is **defer**, not “while we’re here.”
