// Converts ical.js times to UTC instants. Zones defined in the file are handled
// by ical.js; floating times, dates and TZIDs with no definition are resolved
// against an IANA zone with Intl, so the result never depends on the machine's zone.
import ICAL from "ical.js";

type Time = InstanceType<typeof ICAL.Time>;

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-GB", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
  });
  formatters.set(timeZone, created);
  return created;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The zone's offset from UTC, in milliseconds, at the given instant. */
function offsetAt(utcMs: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The UTC instant of a wall-clock time in an IANA zone. A time skipped by a clock change resolves forward. */
export function wallClockToUtc(wall: WallClock, timeZone: string): number {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const first = naive - offsetAt(naive, timeZone);
  const second = naive - offsetAt(first, timeZone);
  return offsetAt(second, timeZone) === offsetAt(first, timeZone) ? second : Math.max(first, second);
}

const wallOf = (time: Time): WallClock => ({
  year: time.year, month: time.month, day: time.day,
  hour: time.isDate ? 0 : time.hour, minute: time.isDate ? 0 : time.minute, second: time.isDate ? 0 : time.second,
});

/**
 * The UTC instant of an ical.js time. Dates are local midnight in `officeZone`;
 * floating or unresolved times are read in `fallbackZone`.
 */
export function icalTimeToUtc(time: Time, fallbackZone: string, officeZone: string): number {
  if (time.isDate) return wallClockToUtc(wallOf(time), officeZone);
  if (time.zone === ICAL.Timezone.utcTimezone) return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  if (time.zone && time.zone !== ICAL.Timezone.localTimezone) return time.toUnixTime() * 1000;
  return wallClockToUtc(wallOf(time), fallbackZone);
}

export const toIso = (utcMs: number): string => new Date(utcMs).toISOString();
