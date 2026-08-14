import { db } from "@workspace/db";
import { bookingEvents, bookings, companionProfiles } from "@workspace/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import {
  bookingRange,
  rangesOverlap,
} from "./pilot";

const BUSY_STATUSES = ["confirmed", "authorized"] as const;

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
  const next = bookingRange(input.date, input.startTime, input.durationHours, input.startsAt);
  const filters = [
    eq(bookings.companionId, input.companionId),
    inArray(bookings.status, [...BUSY_STATUSES]),
  ];
  if (input.excludeBookingId) filters.push(ne(bookings.id, input.excludeBookingId));
  const rows = await db
    .select()
    .from(bookings)
    .where(and(...filters));
  return rows.some((row) => {
    const other = bookingRange(row.date, row.startTime, Number(row.durationHours), row.startsAt);
    return rangesOverlap(next.start, next.end, other.start, other.end);
  });
}

/** Instant Book: confirm after deposit (or keep authorized) if opted in and no overlap. */
export async function maybeInstantConfirm(bookingId: string): Promise<boolean> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return false;
  if (["completed", "cancelled"].includes(booking.status)) return false;
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
