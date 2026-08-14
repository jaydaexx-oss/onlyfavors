import { db } from "@workspace/db";
import { bookingEvents, bookings, companionProfiles } from "@workspace/db/schema";
import { and, eq, inArray, isNotNull, lt, ne } from "drizzle-orm";
import {
  bookingRange,
  rangesOverlap,
} from "./pilot";

/**
 * Pilot booking states (server-only). Browser/PostgREST cannot skip these.
 *
 * requested       10-minute unpaid hold (user: payment_pending / hold)
 * deposit_paid    $10 deposit webhook-confirmed; chat unlocks
 * confirmed       companion accepted or Instant Book
 * authorized      full payment capturable (webhook); funds on platform
 * completed       checkout captured; companion transfer if not held
 *
 * expired         unpaid hold lapsed
 * cancelled       declined, cancelled, refunded, no_show (see booking_events.note)
 */
export const HOLD_TTL_MS = 10 * 60 * 1000;

const OCCUPIED_STATUSES = ["requested", "deposit_paid", "confirmed", "authorized"] as const;

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  requested: ["deposit_paid", "expired", "cancelled"],
  deposit_paid: ["confirmed", "authorized", "cancelled"],
  confirmed: ["authorized", "completed", "cancelled"],
  authorized: ["completed", "cancelled"],
};

export function assertBookingTransition(from: string, to: string): void {
  if (from === to) return;
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed?.includes(to)) {
    throw Object.assign(new Error(`Booking cannot move from ${from} to ${to}`), { status: 409 });
  }
}

export function isExclusionViolation(err: unknown): boolean {
  const walk = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    const e = value as { code?: string; message?: string; cause?: unknown };
    if (e.code === "23P01") return true;
    if (typeof e.message === "string" && e.message.includes("bookings_companion_slot_excl")) return true;
    return walk(e.cause);
  };
  return walk(err);
}

export async function expireUnpaidHolds(): Promise<number> {
  try {
    const expired = await db
      .update(bookings)
      .set({ status: "expired", holdExpiresAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(bookings.status, "requested"),
          lt(bookings.holdExpiresAt, new Date()),
          isNotNull(bookings.holdExpiresAt),
        ),
      )
      .returning({ id: bookings.id });
    for (const row of expired) {
      await recordBookingEvent({
        bookingId: row.id,
        fromStatus: "requested",
        toStatus: "expired",
        note: "unpaid_hold",
      });
    }
    return expired.length;
  } catch {
    try {
      await db.execute(sql`SELECT expire_unpaid_booking_holds()`);
    } catch {
      /* migration 0007 may not be applied yet */
    }
    return 0;
  }
}

export async function recordBookingEvent(input: {
  bookingId: string;
  fromStatus?: string | null;
  toStatus: string;
  actorId?: string | null;
  note?: string;
}): Promise<void> {
  try {
    await db.insert(bookingEvents).values({
      bookingId: input.bookingId,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus,
      actorId: input.actorId ?? null,
      note: input.note ?? null,
    });
  } catch {
    /* table may not exist until 0005 is applied */
  }
}

export async function companionHasOverlap(input: {
  companionId: string;
  date: string;
  startTime: string;
  durationHours: number;
  excludeBookingId?: string;
  startsAt?: Date | null;
}): Promise<boolean> {
  await expireUnpaidHolds();
  const next = bookingRange(input.date, input.startTime, input.durationHours, input.startsAt);
  const filters = [
    eq(bookings.companionId, input.companionId),
    inArray(bookings.status, [...OCCUPIED_STATUSES]),
  ];
  if (input.excludeBookingId) filters.push(ne(bookings.id, input.excludeBookingId));
  const rows = await db
    .select()
    .from(bookings)
    .where(and(...filters));
  const now = Date.now();
  return rows.some((row) => {
    if (row.status === "requested" && row.holdExpiresAt && row.holdExpiresAt.getTime() <= now) {
      return false;
    }
    const other = bookingRange(row.date, row.startTime, Number(row.durationHours), row.startsAt);
    return rangesOverlap(next.start, next.end, other.start, other.end);
  });
}

/** Instant Book: confirm after deposit (or keep authorized) if opted in and no overlap. */
export async function maybeInstantConfirm(bookingId: string): Promise<boolean> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return false;
  if (["completed", "cancelled", "expired"].includes(booking.status)) return false;
  if (["confirmed", "authorized"].includes(booking.status)) return true;
  const [profile] = await db
    .select()
    .from(companionProfiles)
    .where(eq(companionProfiles.id, booking.companionId))
    .limit(1);
  if (!profile?.instantBook || !profile.approved || profile.paused) return false;
  const overlap = await companionHasOverlap({
    companionId: booking.companionId,
    date: booking.date,
    startTime: booking.startTime,
    durationHours: Number(booking.durationHours),
    excludeBookingId: booking.id,
    startsAt: booking.startsAt,
  });
  if (overlap) return false;
  assertBookingTransition(booking.status, "confirmed");
  await db
    .update(bookings)
    .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));
  await recordBookingEvent({
    bookingId,
    fromStatus: booking.status,
    toStatus: "confirmed",
    note: "instant_book",
  });
  return true;
}
