// Turns VEVENT components into raw occurrences inside a window: expands
// series (RRULE, RDATE, EXDATE via ical.js), lets overriding instances replace
// their original slot, and works out each occurrence's start and end in UTC.
import ICAL from "ical.js";
import { icalTimeToUtc, isValidTimeZone, toIso } from "./zoned-time";

type Component = InstanceType<typeof ICAL.Component>;
type Time = InstanceType<typeof ICAL.Time>;
type Duration = InstanceType<typeof ICAL.Duration>;

/** One occurrence before the private policy and field mapping are applied. */
export interface RawOccurrence {
  uid: string;
  recurrenceId: string;
  /** The component whose details apply: the overriding instance if there is one, else the series. */
  component: Component;
  startMs: number;
  endMs: number;
  allDay: boolean;
}

export interface ExpandContext {
  officeZone: string;
  windowStartMs: number;
  windowEndMs: number;
  warn: (message: string) => void;
}

/** Guards against a rule that never reaches the window end. */
const MAX_OCCURRENCES_PER_SERIES = 20000;

/** The zone to read a property's floating or unresolved time in: its TZID if Intl knows it, else the office zone. */
function fallbackZoneFor(component: Component, propName: string, time: Time, ctx: ExpandContext): string {
  const tzid = component.getFirstProperty(propName)?.getParameter("tzid");
  if (typeof tzid !== "string" || tzid === "") return ctx.officeZone;
  if (time.zone && time.zone !== ICAL.Timezone.localTimezone) return ctx.officeZone;
  if (isValidTimeZone(tzid)) return tzid;
  ctx.warn(`Time zone "${tzid}" is not defined in the file; its times were read as ${ctx.officeZone}.`);
  return ctx.officeZone;
}

function timeOf(component: Component, propName: string): Time | null {
  const value = component.getFirstPropertyValue(propName);
  return value instanceof ICAL.Time ? value : null;
}

/** How long each occurrence lasts, as a wall-clock duration: DTEND - DTSTART, else DURATION, else a day for dates and nothing for times. */
function durationOf(component: Component, start: Time): Duration {
  const end = timeOf(component, "dtend");
  if (end) return end.subtractDate(start);
  const duration = component.getFirstPropertyValue("duration");
  if (duration instanceof ICAL.Duration) return duration;
  return ICAL.Duration.fromData({ days: start.isDate ? 1 : 0 });
}

function occurrence(component: Component, uid: string, recurrenceId: string, start: Time, duration: Duration, zone: string, ctx: ExpandContext): RawOccurrence {
  const end = start.clone();
  end.addDuration(duration);
  const startMs = icalTimeToUtc(start, zone, ctx.officeZone);
  const endMs = Math.max(startMs, icalTimeToUtc(end, zone, ctx.officeZone));
  return { uid, recurrenceId, component, startMs, endMs, allDay: start.isDate };
}

const inWindow = (o: RawOccurrence, ctx: ExpandContext): boolean => o.startMs >= ctx.windowStartMs && o.startMs < ctx.windowEndMs;
const isSeries = (component: Component): boolean => component.hasProperty("rrule") || component.hasProperty("rdate");

/** The original start, as ISO UTC, that an overriding instance replaces. */
export function recurrenceIdOf(component: Component, ctx: ExpandContext): string {
  const time = timeOf(component, "recurrence-id");
  if (!time) return "";
  return toIso(icalTimeToUtc(time, fallbackZoneFor(component, "recurrence-id", time, ctx), ctx.officeZone));
}

/** Occurrences of a series (or its single occurrence), skipping slots that an override replaces. */
export function expandMaster(master: Component, uid: string, overridden: ReadonlySet<string>, ctx: ExpandContext): RawOccurrence[] {
  const start = timeOf(master, "dtstart");
  if (!start) {
    ctx.warn(`An event (UID ${uid}) has no DTSTART and was skipped.`);
    return [];
  }
  const zone = fallbackZoneFor(master, "dtstart", start, ctx);
  const duration = durationOf(master, start);
  if (!isSeries(master)) {
    const single = occurrence(master, uid, "", start, duration, zone, ctx);
    return inWindow(single, ctx) ? [single] : [];
  }
  const kept: RawOccurrence[] = [];
  const iterator = new ICAL.Event(master).iterator();
  for (let count = 0; count < MAX_OCCURRENCES_PER_SERIES; count++) {
    const next: Time | undefined = iterator.next();
    if (!next) return kept;
    const startMs = icalTimeToUtc(next, zone, ctx.officeZone);
    if (startMs >= ctx.windowEndMs) return kept;
    const recurrenceId = toIso(startMs);
    if (startMs < ctx.windowStartMs || overridden.has(recurrenceId)) continue;
    kept.push(occurrence(master, uid, recurrenceId, next, duration, zone, ctx));
  }
  ctx.warn(`A series (UID ${uid}) has more than ${MAX_OCCURRENCES_PER_SERIES} occurrences; the rest were skipped.`);
  return kept;
}

/** An overriding instance (a VEVENT with RECURRENCE-ID), at its own, possibly moved, time. */
export function expandOverride(override: Component, uid: string, recurrenceId: string, ctx: ExpandContext): RawOccurrence[] {
  const start = timeOf(override, "dtstart");
  if (!start) {
    ctx.warn(`An instance (UID ${uid}, ${recurrenceId}) has no DTSTART and was skipped.`);
    return [];
  }
  const zone = fallbackZoneFor(override, "dtstart", start, ctx);
  const single = occurrence(override, uid, recurrenceId, start, durationOf(override, start), zone, ctx);
  return inWindow(single, ctx) ? [single] : [];
}
