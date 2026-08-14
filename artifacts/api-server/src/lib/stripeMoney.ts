import { getUncachableStripeClient } from "./stripeClient";
import { CANCEL_FEE_CENTS, LATE_CANCEL_HOURS, chicagoDateTime, hoursUntilStart } from "./pilot";

export async function refundOrCancelIntent(
  paymentIntentId: string | null | undefined,
  amountCents?: number,
): Promise<{ ok: boolean; detail: string }> {
  if (!paymentIntentId) return { ok: true, detail: "no_intent" };
  const stripe = await getUncachableStripeClient();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status === "canceled") return { ok: true, detail: "already_canceled" };
  if (pi.status === "requires_capture" || pi.status === "requires_confirmation" || pi.status === "requires_payment_method") {
    await stripe.paymentIntents.cancel(paymentIntentId);
    return { ok: true, detail: "canceled_uncaptured" };
  }
  if (pi.status === "succeeded") {
    const alreadyRefunded = (pi.amount_received ?? 0) <= (pi.amount_refunded ?? 0);
    if (alreadyRefunded) return { ok: true, detail: "already_refunded" };
    const maxRefundable = (pi.amount_received ?? pi.amount) - (pi.amount_refunded ?? 0);
    const amount = amountCents != null ? Math.min(amountCents, maxRefundable) : maxRefundable;
    if (amount <= 0) return { ok: true, detail: "nothing_to_refund" };
    await stripe.refunds.create({ payment_intent: paymentIntentId, amount });
    return { ok: true, detail: "refunded" };
  }
  return { ok: false, detail: `unexpected_status_${pi.status}` };
}

export async function captureIntentIfHeld(paymentIntentId: string | null | undefined): Promise<{ ok: boolean; detail: string }> {
  if (!paymentIntentId) return { ok: false, detail: "no_intent" };
  const stripe = await getUncachableStripeClient();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status === "succeeded") return { ok: true, detail: "already_captured" };
  if (pi.status !== "requires_capture") return { ok: false, detail: pi.status };
  await stripe.paymentIntents.capture(paymentIntentId);
  return { ok: true, detail: "captured" };
}

/** Separate charges and transfers: funds stay on the platform until this runs. */
export async function transferCompanionPayout(input: {
  bookingId: string;
  amountCents: number;
  destinationAccountId: string;
  existingTransferId?: string | null;
}): Promise<{ ok: boolean; transferId?: string; detail: string }> {
  if (input.existingTransferId) return { ok: true, transferId: input.existingTransferId, detail: "already_transferred" };
  if (!input.destinationAccountId || input.amountCents <= 0) {
    return { ok: false, detail: "no_destination" };
  }
  const stripe = await getUncachableStripeClient();
  const transfer = await stripe.transfers.create({
    amount: input.amountCents,
    currency: "usd",
    destination: input.destinationAccountId,
    transfer_group: input.bookingId,
    metadata: { bookingId: input.bookingId },
  });
  return { ok: true, transferId: transfer.id, detail: "transferred" };
}

export function customerCancelPlan(booking: {
  status: string;
  date: string;
  startTime: string;
  startsAt?: Date | null;
  totalCents: number;
  depositCents: number;
}) {
  const accepted = ["confirmed", "authorized"].includes(booking.status);
  if (!accepted) {
    return { keepFeeCents: 0, refundDeposit: true, refundFull: true as const };
  }
  const start = booking.startsAt ?? chicagoDateTime(booking.date, booking.startTime);
  const hours = hoursUntilStart(start);
  if (hours >= LATE_CANCEL_HOURS) {
    return { keepFeeCents: 0, refundDeposit: true, refundFull: true as const };
  }
  return {
    keepFeeCents: CANCEL_FEE_CENTS,
    refundDeposit: false,
    refundFull: true as const,
    refundFullAmountCents: Math.max(0, booking.totalCents - CANCEL_FEE_CENTS),
  };
}
