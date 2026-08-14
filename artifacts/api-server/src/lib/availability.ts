import type { WorkspacePrefs } from "@workspace/db/schema";
import { chicagoDateTime, PILOT_TZ } from "./pilot";

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const WEEKDAY_FROM_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const TIME = /^\d{2}:\d{2}$/;

export function parseClock(value: unknown, fallback: string): string {
  const raw = String(value ?? "").trim();
  return TIME.test(raw) ? raw : fallback;
}

export function weekdayFromName(day: string): number | null {
  const n = WEEKDAY_FROM_NAME[day];
  return typeof n === "number" ? n : null;
}

export function dayNameFromWeekday(weekday: number): string {
  return DAY_NAMES[weekday] ?? "Mon";
}

function formatClock(t: string): string {
  const [hRaw, mRaw] = t.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
  const suffix = h >= 12 ? "pm" : "am";
  const hr = h % 12 || 12;
  return m ? `${hr}:${String(m).padStart(2, "0")}${suffix}` : `${hr}${suffix}`;
}

export function windowsToEditor(windows: Array<{ weekday: number; startTime: string; endTime: string }>) {
  const availableDays = windows
    .map((w) => dayNameFromWeekday(w.weekday))
    .filter((day, i, all) => all.indexOf(day) === i);
  return {
    availableDays,
    availableHoursStart: windows[0]?.startTime ?? "10:00",
    availableHoursEnd: windows[0]?.endTime ?? "20:00",
  };
}

export function windowsToPublic(windows: Array<{ weekday: number; startTime: string; endTime: string }>) {
  return windows.map((w) => ({
    day: dayNameFromWeekday(w.weekday),
    hours: `${formatClock(w.startTime)} – ${formatClock(w.endTime)}`,
  }));
}

export function editorToWindows(
  companionId: string,
  days: unknown,
  startRaw: unknown,
  endRaw: unknown,
) {
  const startTime = parseClock(startRaw, "10:00");
  const endTime = parseClock(endRaw, "20:00");
  const names = Array.isArray(days) ? days.map((d) => String(d)) : [];
  return names
    .map((day) => weekdayFromName(day))
    .filter((weekday): weekday is number => weekday !== null)
    .filter((weekday, i, all) => all.indexOf(weekday) === i)
    .map((weekday) => ({ companionId, weekday, startTime, endTime }));
}

export function defaultWorkspacePrefs(): Required<WorkspacePrefs> {
  return {
    quietHours: { enabled: false, start: "22:00", end: "08:00" },
    away: { enabled: false, returnDate: "", note: "", pausedByAway: false },
  };
}

export function mergeWorkspacePrefs(raw: WorkspacePrefs | null | undefined): Required<WorkspacePrefs> {
  const base = defaultWorkspacePrefs();
  return {
    quietHours: {
      ...base.quietHours,
      ...(raw?.quietHours ?? {}),
      start: parseClock(raw?.quietHours?.start, base.quietHours.start),
      end: parseClock(raw?.quietHours?.end, base.quietHours.end),
      enabled: Boolean(raw?.quietHours?.enabled),
    },
    away: {
      ...base.away,
      ...(raw?.away ?? {}),
      enabled: Boolean(raw?.away?.enabled),
      returnDate: String(raw?.away?.returnDate ?? "").slice(0, 20),
      note: String(raw?.away?.note ?? "").slice(0, 100),
      pausedByAway: Boolean(raw?.away?.pausedByAway),
    },
  };
}

function chicagoClockParts(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PILOT_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayName = get("weekday");
  return {
    weekday: weekdayFromName(weekdayName.slice(0, 3)) ?? 0,
    clock: `${String(get("hour")).padStart(2, "0")}:${String(get("minute")).padStart(2, "0")}`,
  };
}

function clockInRange(clock: string, start: string, end: string): boolean {
  return clock >= start && clock < end;
}

/** True when published weekly windows cover Now / Tonight / This weekend / a calendar date (Chicago). */
export function windowsMatchWhen(
  windows: Array<{ weekday: number; startTime: string; endTime: string }>,
  when: string | undefined,
  now = new Date(),
): boolean {
  if (!when) return true;
  if (!windows.length) return false;
  const here = chicagoClockParts(now);
  if (when === "now") {
    return windows.some((w) => w.weekday === here.weekday && clockInRange(here.clock, w.startTime, w.endTime));
  }
  if (when === "tonight") {
    return windows.some((w) => w.weekday === here.weekday && w.endTime > "17:00");
  }
  if (when === "weekend") {
    return windows.some((w) => w.weekday === 0 || w.weekday === 6);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) {
    const [datePart, timePart] = when.split("T");
    const parts = chicagoClockParts(chicagoDateTime(datePart, timePart));
    return windows.some((w) => w.weekday === parts.weekday && clockInRange(parts.clock, w.startTime, w.endTime));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(when)) {
    const [y, m, d] = when.split("-").map(Number);
    const noonUtc = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 18, 0, 0);
    const weekday = chicagoClockParts(new Date(noonUtc)).weekday;
    return windows.some((w) => w.weekday === weekday);
  }
  return true;
}

export function windowsHint(
  windows: Array<{ weekday: number; startTime: string; endTime: string }>,
  now = new Date(),
): "now" | "tonight" | "weekend" | null {
  if (windowsMatchWhen(windows, "now", now)) return "now";
  if (windowsMatchWhen(windows, "tonight", now)) return "tonight";
  if (windowsMatchWhen(windows, "weekend", now)) return "weekend";
  return null;
}
