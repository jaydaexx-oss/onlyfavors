import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { boundaryReceipts, bookings, companionProfiles, safespots } from "@workspace/db/schema";

export type BoundaryReceiptView = {
  activity: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  clauses: string[];
  customerAgreedAt: string | null;
  companionAgreedAt: string | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function endClock(startTime: string, durationHours: number): string {
  const [h, m] = String(startTime).split(":").map(Number);
  const total = (h || 0) * 60 + (m || 0) + Math.round(Number(durationHours) * 60);
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

export function platformBoundaryClauses(input: {
  activity: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  companionBoundaries: string[];
}): string[] {
  const hours = Number(input.durationHours);
  const extra = input.companionBoundaries.map((line) => line.trim()).filter(Boolean).slice(0, 12);
  return [
    `Activity: ${input.activity}. This favor stays platonic and inside that activity.`,
    `Meet Here: ${input.venueName} (public SafeSpot). Never a home or workplace.`,
    `Time: ${input.date} ${input.startTime}–${input.endTime} America/Chicago (${hours} hour${hours === 1 ? "" : "s"}). Either person may end early without explanation.`,
    "Transportation: Each person keeps their own way there and home. Do not rely on the other person for a ride.",
    "Physical contact: A polite greeting only, unless a companion boundary below is stricter. No dating or sexual contact.",
    "Photography: No photos, video, or identifying posts without explicit consent from the person pictured.",
    "Alcohol: No pressure to drink. Follow the companion's stated boundaries.",
    "Topics and behavior: Follow every companion boundary below. Harassment, coercion, or off-platform payment ends the booking.",
    ...extra,
  ];
}

function serialize(row: typeof boundaryReceipts.$inferSelect): BoundaryReceiptView {
  return {
    activity: row.activity,
    venueName: row.venueName,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    durationHours: Number(row.durationHours),
    clauses: Array.isArray(row.clauses) ? row.clauses : [],
    customerAgreedAt: row.customerAgreedAt?.toISOString() ?? null,
    companionAgreedAt: row.companionAgreedAt?.toISOString() ?? null,
  };
}

export async function previewBoundaryReceipt(bookingId: string): Promise<BoundaryReceiptView | null> {
  const [existing] = await db.select().from(boundaryReceipts).where(eq(boundaryReceipts.bookingId, bookingId)).limit(1);
  if (existing) return serialize(existing);
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return null;
  let venueName = "Public SafeSpot";
  if (booking.safeSpotId) {
    const [spot] = await db.select().from(safespots).where(eq(safespots.id, booking.safeSpotId)).limit(1);
    if (spot) venueName = spot.name;
  }
  const [profile] = await db.select().from(companionProfiles).where(eq(companionProfiles.id, booking.companionId)).limit(1);
  const durationHours = Number(booking.durationHours);
  const startTime = booking.startTime;
  const endTime = endClock(startTime, durationHours);
  return {
    activity: booking.activity,
    venueName,
    date: booking.date,
    startTime,
    endTime,
    durationHours,
    clauses: platformBoundaryClauses({
      activity: booking.activity,
      venueName,
      date: booking.date,
      startTime,
      endTime,
      durationHours,
      companionBoundaries: profile?.boundaries ?? [],
    }),
    customerAgreedAt: null,
    companionAgreedAt: null,
  };
}

export async function signBoundaryReceipt(
  bookingId: string,
  party: "customer" | "companion",
): Promise<BoundaryReceiptView> {
  const preview = await previewBoundaryReceipt(bookingId);
  if (!preview) throw new Error("Booking not found");
  const now = new Date();
  const [existing] = await db.select().from(boundaryReceipts).where(eq(boundaryReceipts.bookingId, bookingId)).limit(1);
  if (!existing) {
    const [row] = await db.insert(boundaryReceipts).values({
      bookingId,
      activity: preview.activity,
      venueName: preview.venueName,
      date: preview.date,
      startTime: preview.startTime,
      endTime: preview.endTime,
      durationHours: String(preview.durationHours),
      clauses: preview.clauses,
      customerAgreedAt: party === "customer" ? now : null,
      companionAgreedAt: party === "companion" ? now : null,
    }).returning();
    return serialize(row);
  }
  if (party === "customer" && !existing.customerAgreedAt) {
    const [row] = await db.update(boundaryReceipts).set({ customerAgreedAt: now }).where(eq(boundaryReceipts.bookingId, bookingId)).returning();
    return serialize(row);
  }
  if (party === "companion" && !existing.companionAgreedAt) {
    const [row] = await db.update(boundaryReceipts).set({ companionAgreedAt: now }).where(eq(boundaryReceipts.bookingId, bookingId)).returning();
    return serialize(row);
  }
  return serialize(existing);
}

export async function loadBoundaryReceipt(bookingId: string): Promise<BoundaryReceiptView | null> {
  try {
    const [row] = await db.select().from(boundaryReceipts).where(eq(boundaryReceipts.bookingId, bookingId)).limit(1);
    return row ? serialize(row) : null;
  } catch {
    return null;
  }
}
