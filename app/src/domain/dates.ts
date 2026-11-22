// Dates and times in the office's zone, with Intl only. Instants are ISO UTC
// strings; dates are YYYY-MM-DD.

const LOCALE = "en-GB";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

type Parts = Record<string, string>;

function partsIn(iso: string, zone: string, options: Intl.DateTimeFormatOptions): Parts {
  const parts = new Intl.DateTimeFormat(LOCALE, { timeZone: zone, ...options }).formatToParts(new Date(iso));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** "Tue 24 Nov" */
export function formatDay(iso: string, zone: string): string {
  const p = partsIn(iso, zone, { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "14:00", on a 24-hour clock. */
export function formatTime(iso: string, zone: string): string {
  const p = partsIn(iso, zone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${p.hour}:${p.minute}`;
}

/** The local date (YYYY-MM-DD) of an instant in a zone. */
export function dateIn(iso: string, zone: string): string {
  const p = partsIn(iso, zone, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

/** Today's date in a zone, at the instant `now`. */
export function todayIn(zone: string, now: string): string {
  return dateIn(now, zone);
}

/** Whether a date or instant falls before, on or after today in the zone. Undefined when it is not a date. */
export function relativeDay(value: string, now: string, zone: string): "past" | "today" | "future" | undefined {
  const date = DATE_ONLY.test(value) ? value : Number.isNaN(Date.parse(value)) || value === "" ? undefined : dateIn(value, zone);
  if (date === undefined) return undefined;
  const today = todayIn(zone, now);
  if (date < today) return "past";
  return date === today ? "today" : "future";
}

/** A date some whole days later (or earlier, when negative). */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The weekday of a date: 0 is Sunday, 6 is Saturday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
