import type { WorkspacePrefs } from "@workspace/db/schema";

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
