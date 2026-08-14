export const PILOT_TZ = "America/Chicago";
export const PILOT_CITY = "New Orleans";
export const MIN_DURATION_HOURS = 1;
export const MAX_DURATION_HOURS = 8;
export const FULL_DAY_HOURS = 7;
export const LATE_CANCEL_HOURS = 24;
export const CANCEL_FEE_CENTS = 1_000;

export function isPilotCity(value: string | undefined | null): boolean {
  const v = String(value ?? "").toLowerCase();
  return v.includes("new orleans") || v === "nola";
}

export function assertDurationHours(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_DURATION_HOURS || n > MAX_DURATION_HOURS) {
    throw new Error(`Duration must be between ${MIN_DURATION_HOURS} and ${MAX_DURATION_HOURS} hours`);
  }
  if (Math.round(n * 2) !== n * 2) {
    throw new Error("Duration must be in 30-minute steps");
  }
  return n;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function wallAsUtcMs(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0);
}

function chicagoWallUtcMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PILOT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

/** Interpret YYYY-MM-DD + HH:MM as America/Chicago wall time. */
export function chicagoDateTime(date: string, startTime: string): Date {
  const time = /^\d{2}:\d{2}$/.test(startTime) ? startTime : "10:00";
  const desired = wallAsUtcMs(date, time);
  let instant = desired;
  instant += desired - chicagoWallUtcMs(new Date(instant));
  return new Date(instant);
}

export function bookingRange(date: string, startTime: string, durationHours: number, startsAt?: Date | null) {
  const start = startsAt ?? chicagoDateTime(date, startTime);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return { start, end };
}

export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export function hoursUntilStart(startsAt: Date, now = new Date()): number {
  return (startsAt.getTime() - now.getTime()) / 3_600_000;
}

export function formatChicagoClock(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PILOT_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function padClock(h: number, m: number): string {
  return `${pad(h)}:${pad(m)}`;
}
