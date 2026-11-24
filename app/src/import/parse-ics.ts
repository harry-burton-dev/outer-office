// Reads an .ics file (typically Outlook's "Save Calendar" export) into one
// ImportedEvent per occurrence inside a window. Pure: no I/O, no clock.
// Occurrences are kept when windowStart <= start < windowEnd.
import ICAL from "ical.js";
import type { ImportedEvent } from "./types";
import { eventKey } from "./types";
import { detailsOf, isCancelled, isPrivate, maskDetails, textOf } from "./event-fields";
import { expandMaster, expandOverride, recurrenceIdOf, type ExpandContext, type RawOccurrence } from "./expand";
import { isValidTimeZone, toIso } from "./zoned-time";

type Component = InstanceType<typeof ICAL.Component>;

export interface ParseOptions {
  /** The office's IANA zone, used for floating times and all-day events. */
  timeZone: string;
  /** ISO UTC; occurrences before this are ignored. */
  windowStart: string;
  /** ISO UTC; occurrences after this are ignored. */
  windowEnd: string;
  privatePolicy: "drop" | "mask";
}

export interface ParseResult {
  /** One per occurrence, sorted by start then uid. */
  events: readonly ImportedEvent[];
  /**
   * The span the file covers (ISO UTC), within the window: the range the file
   * declares (Outlook's X-CALSTART/X-CALEND) widened to take in every occurrence
   * kept. With no declared range it is the occurrences' span, or the window if none.
   */
  rangeStart: string;
  rangeEnd: string;
  droppedPrivate: number;
  maskedPrivate: number;
  warnings: readonly string[];
}

const emptyResult = (options: ParseOptions, warnings: readonly string[]): ParseResult => ({
  events: [], rangeStart: options.windowStart, rangeEnd: options.windowEnd, droppedPrivate: 0, maskedPrivate: 0, warnings,
});

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The VCALENDAR components in the text, or a reason there are none. */
function readCalendars(text: string): Component[] | string {
  let jcal: unknown;
  try {
    jcal = ICAL.parse(text);
  } catch (error: unknown) {
    return `The file could not be read as a calendar: ${messageOf(error)}`;
  }
  if (!Array.isArray(jcal)) return "The file could not be read as a calendar.";
  const roots: unknown[] = typeof jcal[0] === "string" ? [jcal] : jcal;
  const calendars = roots.filter(Array.isArray).map((root) => new ICAL.Component(root)).filter((c) => c.name === "vcalendar");
  return calendars.length > 0 ? calendars : "The file contains no calendar (no BEGIN:VCALENDAR).";
}

/** Registers the file's VTIMEZONEs that are not already known; returns a function that removes them again. */
function registerZones(calendars: readonly Component[]): () => void {
  const added: string[] = [];
  for (const zone of calendars.flatMap((c) => c.getAllSubcomponents("vtimezone"))) {
    const tzid = textOf(zone, "tzid");
    if (tzid === "" || ICAL.TimezoneService.has(tzid) || added.includes(tzid)) continue;
    ICAL.TimezoneService.register(zone);
    added.push(tzid);
  }
  return () => added.forEach((tzid) => ICAL.TimezoneService.remove(tzid));
}

interface Series {
  masters: Component[];
  overrides: Component[];
}

function groupByUid(calendars: readonly Component[], warn: (m: string) => void): ReadonlyMap<string, Series> {
  const groups = new Map<string, Series>();
  for (const vevent of calendars.flatMap((c) => c.getAllSubcomponents("vevent"))) {
    const uid = textOf(vevent, "uid");
    if (uid === "") {
      warn(`An event with no UID ("${textOf(vevent, "summary")}") was skipped.`);
      continue;
    }
    const group = groups.get(uid) ?? { masters: [], overrides: [] };
    (vevent.hasProperty("recurrence-id") ? group.overrides : group.masters).push(vevent);
    groups.set(uid, group);
  }
  return groups;
}

function expandSeries(uid: string, series: Series, ctx: ExpandContext): RawOccurrence[] {
  const overrides = series.overrides.map((component) => ({ component, recurrenceId: recurrenceIdOf(component, ctx) }));
  const overridden = new Set(overrides.map((o) => o.recurrenceId));
  if (series.masters.length > 1) ctx.warn(`UID ${uid} appears more than once; only the first was used.`);
  const master = series.masters[0];
  return [
    ...(master ? expandMaster(master, uid, overridden, ctx) : []),
    ...overrides.flatMap((o) => expandOverride(o.component, uid, o.recurrenceId, ctx)),
  ];
}

function expandAll(groups: ReadonlyMap<string, Series>, ctx: ExpandContext): RawOccurrence[] {
  return [...groups].flatMap(([uid, series]) => {
    try {
      return expandSeries(uid, series, ctx);
    } catch (error: unknown) {
      ctx.warn(`An event (UID ${uid}) could not be read and was skipped: ${messageOf(error)}`);
      return [];
    }
  });
}

function toImported(raw: RawOccurrence, masked: boolean): ImportedEvent {
  const details = detailsOf(raw.component);
  return {
    uid: raw.uid, recurrenceId: raw.recurrenceId, start: toIso(raw.startMs), end: toIso(raw.endMs), allDay: raw.allDay,
    ...(masked ? maskDetails(details) : details), masked,
    source: "ics",
    kind: raw.recurrenceId === "" ? "single" : raw.component.hasProperty("recurrence-id") ? "exception" : "occurrence",
    seriesId: raw.recurrenceId === "" ? "" : raw.uid,
  };
}

const compareEvents = (a: ImportedEvent, b: ImportedEvent): number =>
  a.start.localeCompare(b.start) || a.uid.localeCompare(b.uid) || a.recurrenceId.localeCompare(b.recurrenceId);

/** "20261012T000000Z" as ISO UTC, or "" when absent or not a UTC date-time. */
function utcStamp(calendar: Component, name: string): string {
  const value = calendar.getFirstPropertyValue(name);
  const match = typeof value === "string" ? /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value.trim()) : null;
  if (!match) return "";
  const [, y, mo, d, h, mi, se] = match.map(Number) as [number, number, number, number, number, number, number];
  const ms = Date.UTC(y, mo - 1, d, h, mi, se);
  return Number.isNaN(ms) ? "" : toIso(ms);
}

type Range = { start: string; end: string } | null;

/** The range the file says it was exported for, clipped to the window; null when it declares none. */
function declaredRange(calendars: readonly Component[], options: ParseOptions): Range {
  const calendar = calendars[0];
  if (!calendar) return null;
  const [start, end] = [utcStamp(calendar, "x-calstart"), utcStamp(calendar, "x-calend")];
  if (start === "" || end === "") return null;
  const startMs = Math.max(Date.parse(start), Date.parse(options.windowStart));
  const endMs = Math.min(Date.parse(end), Date.parse(options.windowEnd));
  return startMs < endMs ? { start: toIso(startMs), end: toIso(endMs) } : null;
}

function buildResult(raw: readonly RawOccurrence[], options: ParseOptions, warnings: readonly string[], declared: Range): ParseResult {
  const live = raw.filter((o) => !isCancelled(o.component));
  const isPrivateOccurrence = live.map((o) => isPrivate(o.component));
  const privateCount = isPrivateOccurrence.filter(Boolean).length;
  const masking = options.privatePolicy === "mask";
  const events = live
    .flatMap((o, i) => (isPrivateOccurrence[i] && !masking ? [] : [toImported(o, Boolean(isPrivateOccurrence[i]))]))
    .sort(compareEvents);
  const earliest = events[0];
  const dropped = masking ? 0 : privateCount;
  if (!earliest) {
    const empty = { ...emptyResult(options, warnings), droppedPrivate: dropped };
    return declared ? { ...empty, rangeStart: declared.start, rangeEnd: declared.end } : empty;
  }
  const latestEnd = events.reduce((max, e) => (e.end > max ? e.end : max), earliest.end);
  return {
    events,
    rangeStart: declared && declared.start < earliest.start ? declared.start : earliest.start,
    rangeEnd: declared && declared.end > latestEnd ? declared.end : latestEnd,
    droppedPrivate: dropped,
    maskedPrivate: masking ? privateCount : 0,
    warnings,
  };
}

/** Keeps the first occurrence of each eventKey, warning about the rest. */
function dedupe(raw: readonly RawOccurrence[], warn: (m: string) => void): RawOccurrence[] {
  const seen = new Set<string>();
  return raw.filter((o) => {
    const key = eventKey(o);
    if (seen.has(key)) {
      warn(`UID ${o.uid} has the same occurrence more than once; only the first was used.`);
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function parseIcs(text: string, options: ParseOptions): ParseResult {
  const windowStartMs = Date.parse(options.windowStart);
  const windowEndMs = Date.parse(options.windowEnd);
  if (Number.isNaN(windowStartMs) || Number.isNaN(windowEndMs)) return emptyResult(options, ["The import window is not a valid date range."]);
  if (!isValidTimeZone(options.timeZone)) return emptyResult(options, [`"${options.timeZone}" is not a known time zone.`]);
  const calendars = readCalendars(text);
  if (typeof calendars === "string") return emptyResult(options, [calendars]);
  const warnings = new Set<string>();
  const ctx: ExpandContext = { officeZone: options.timeZone, windowStartMs, windowEndMs, warn: (m) => warnings.add(m) };
  const unregister = registerZones(calendars);
  try {
    const raw = dedupe(expandAll(groupByUid(calendars, ctx.warn), ctx), ctx.warn);
    return buildResult(raw, options, [...warnings], declaredRange(calendars, options));
  } finally {
    unregister();
  }
}
