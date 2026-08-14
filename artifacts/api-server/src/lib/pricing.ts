/**
 * OnlyFavors server-enforced pricing.
 *
 * Never trust amounts from the browser. All fee math lives here.
 *
 * Model (as confirmed by product):
 *   Customer pays:  subtotal + 5% safety-and-service fee
 *   Companion gets: subtotal − 15% companion commission
 *   Platform earns: 20% gross (5 customer + 15 companion)
 *
 * Example for a $100 favor:
 *   Subtotal            $100.00
 *   Customer fee (5%)   $  5.00
 *   Customer pays       $105.00
 *   Companion receives  $ 85.00
 *   Platform earns      $ 20.00 gross
 *
 * $10 refundable deposit unlocks masked chat.
 * The deposit is credited toward the final booking total.
 *
 * The 20% is gross revenue before Stripe processing fees (~2.9% + 30¢).
 */

export const CUSTOMER_FEE_PERCENT = 5; // %
export const COMPANION_COMMISSION_PERCENT = 15; // %
export const DEPOSIT_CENTS = 1_000; // $10.00

export interface PriceBreakdown {
  companionId: string;
  durationHours: number;
  subtotalCents: number;
  customerFeeCents: number;
  totalCents: number;
  companionPayoutCents: number;
  platformRevenueCents: number;
  customerFeePercent: number;
  companionCommissionPercent: number;
  depositCents: number;
  depositCreditedToFinal: boolean;
}

/**
 * Calculate the complete pricing breakdown for a booking.
 *
 * @param hourlyRateDollars - Companion's hourly rate in dollars (e.g. 50 → $50/hr)
 * @param durationHours     - Booking duration in hours (e.g. 2.5)
 * @param companionId       - Companion ID, echoed back for client correlation
 */
export function calculatePrice(
  hourlyRateDollars: number,
  durationHours: number,
  companionId: string,
): PriceBreakdown {
  // All math in cents to avoid floating-point drift.
  const subtotalCents = Math.round(hourlyRateDollars * durationHours * 100);
  const customerFeeCents = Math.round(
    subtotalCents * (CUSTOMER_FEE_PERCENT / 100),
  );
  const totalCents = subtotalCents + customerFeeCents;
  const companionPayoutCents = Math.round(
    subtotalCents * ((100 - COMPANION_COMMISSION_PERCENT) / 100),
  );
  // Platform gross = what customer paid − what companion receives
  const platformRevenueCents = totalCents - companionPayoutCents;

  return {
    companionId,
    durationHours,
    subtotalCents,
    customerFeeCents,
    totalCents,
    companionPayoutCents,
    platformRevenueCents,
    customerFeePercent: CUSTOMER_FEE_PERCENT,
    companionCommissionPercent: COMPANION_COMMISSION_PERCENT,
    depositCents: DEPOSIT_CENTS,
    depositCreditedToFinal: true,
  };
}

export function priceForBooking(
  hourlyRateDollars: number,
  durationHours: number,
  companionId: string,
  dayRateDollars?: number | null,
): PriceBreakdown {
  if (durationHours === 7 && dayRateDollars && dayRateDollars > 0) {
    const subtotalCents = Math.round(dayRateDollars * 100);
    const customerFeeCents = Math.round(subtotalCents * (CUSTOMER_FEE_PERCENT / 100));
    const totalCents = subtotalCents + customerFeeCents;
    const companionPayoutCents = Math.round(subtotalCents * ((100 - COMPANION_COMMISSION_PERCENT) / 100));
    return {
      companionId,
      durationHours,
      subtotalCents,
      customerFeeCents,
      totalCents,
      companionPayoutCents,
      platformRevenueCents: totalCents - companionPayoutCents,
      customerFeePercent: CUSTOMER_FEE_PERCENT,
      companionCommissionPercent: COMPANION_COMMISSION_PERCENT,
      depositCents: DEPOSIT_CENTS,
      depositCreditedToFinal: true,
    };
  }
  return calculatePrice(hourlyRateDollars, durationHours, companionId);
}
