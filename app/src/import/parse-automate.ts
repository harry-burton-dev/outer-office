// Reads a diary payload (the `data` of a diary-sync event, or a diary.fetch
// result) into the same ParseResult the .ics parser returns, so both sources
// share one diff and one review. Pure: no I/O, no clock.
//
// The payload's events are Microsoft Graph calendarView items, read out of the
// flow's raw response by automate/graph-calendar.ts, which checks their shape;
// this module checks count, series masters, UTC times, and the window.
import type { Attendee, ImportedEvent } from "./types";
import { eventKey } from "./types";
import type { ParseResult } from "./parse-ics";
import { MASKED_SUBJECT } from "./event-fields";
import { isValidTimeZone, toIso, wallClockToUtc } from "./zoned-time";

export interface DiaryEvent {
  iCalUId: string;
  seriesMasterId?: string | null;
  type?: "singleInstance" | "occurrence" | "exception" | "seriesMaster";
  /** Graph DateTimeOffset, e.g. "2026-10-22T13:00:00Z"; set on occurrences and exceptions. */
  originalStart?: string | null;
  /** Graph dateTime with no zone, e.g. "2026-10-22T13:00:00.0000000", read in `timeZone`. */
  start: string;
  end: string;
  /** Must be "UTC": the flow asks for it with the header Prefer: outlook.timezone="UTC". */
  timeZone?: string | null;
  isAllDay: boolean;
  isCancelled?: boolean | null;
  subject: string;
  location?: string | null;
  organizer?: string | null;
  categories?: readonly string[] | string | null;
  showAs: string;
  sensitivity: "normal" | "personal" | "private" | "confidential";
  lastModifiedDateTime: string;
  attendees?: readonly object[] | null;
  // What the widened $select adds (OUT-83). Absent when the flow doesn't ask for it.
  id?: string | null;
  importance?: string | null;
  createdDateTime?: string | null;
  /** Graph responseStatus.response: the principal's own response. */
  response?: string | null;
  isOnlineMeeting?: boolean | null;
  onlineMeetingProvider?: string | null;
  joinUrl?: string | null;
  hasAttachments?: boolean | null;
  webLink?: string | null;
  isOrganizer?: boolean | null;
  responseRequested?: boolean | null;
  allowNewTimeProposals?: boolean | null;
  organizerAddress?: string | null;
  locationType?: string | null;
  /** body.content, asked for as text with Prefer: outlook.body-content-type="text". */
  body?: string | null;
  /** The item exactly as Graph sent it, as JSON. */
  raw?: string | null;
}

export interface DiaryPayload {
  principal: string;
  windowStart: string;
  windowEnd: string;
  count: number;
  masters?: readonly { id: string; iCalUId: string }[];
  events: readonly DiaryEvent[];
}

export interface AutomateParseOptions {
  /** The office's IANA zone, used for all-day events. */
  timeZone: string;
  privatePolicy: "drop" | "mask";
}

/** Graph showAs → the .ics parser's values. Graph's extra values read as busy, as Outlook's .ics export does. */
const SHOW_AS: Readonly<Record<string, string>> = {
  free: "free", tentative: "tentative", busy: "busy", oof: "oof", workingElsewhere: "busy", unknown: "busy",
};
const PRIVATE_SENSITIVITIES = new Set(["private", "confidential"]);

class Refusal extends Error {}

/** Milliseconds for a Graph time; one with no zone designator is UTC. */
function utcMs(value: string): number {
  const ms = Date.parse(/(Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`);
  if (Number.isNaN(ms)) throw new Refusal(`"${value}" is not a valid time.`);
  return ms;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
function dateIn(ms: number, zone: string): string {
  let formatter = dateFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatters.set(zone, formatter);
  }
  return formatter.format(ms);
}

/**
 * Local midnight in the office zone of the day an all-day time names, as the
 * .ics parser gives it. Graph may send that day as 00:00 UTC or as the local
 * midnight already converted to UTC; both read as the same day.
 */
function officeMidnight(value: string, zone: string): number {
  const ms = utcMs(value);
  const day = ms % 86_400_000 === 0 ? new Date(ms).toISOString().slice(0, 10) : dateIn(ms, zone);
  const [year, month, date] = day.split("-").map(Number);
  return wallClockToUtc({ year: year ?? 0, month: month ?? 0, day: date ?? 0, hour: 0, minute: 0, second: 0 }, zone);
}

/** .ics LAST-MODIFIED has whole seconds and Graph has seven decimals, so compare whole seconds. */
const wholeSeconds = (value: string): string => toIso(Math.floor(utcMs(value) / 1000) * 1000);

const categoriesOf = (value: DiaryEvent["categories"]): string =>
  (typeof value === "string" ? value.split(",") : value ?? []).map((c) => c.trim()).filter((c) => c !== "").join(", ");

/** The (uid, recurrenceId) key the .ics parser would give this item: the series UID plus the original start. */
function keyOf(event: DiaryEvent, masters: ReadonlyMap<string, string>, zone: string): Pick<ImportedEvent, "uid" | "recurrenceId"> {
  if (!event.seriesMasterId) return { uid: event.iCalUId, recurrenceId: "" };
  const uid = masters.get(event.seriesMasterId);
  if (!uid) throw new Refusal(`Series ${event.seriesMasterId} ("${event.subject}") is missing from masters.`);
  if (!event.originalStart) throw new Refusal(`An instance of "${event.subject}" has no originalStart.`);
  const original = event.isAllDay ? officeMidnight(event.originalStart, zone) : utcMs(event.originalStart);
  return { uid, recurrenceId: toIso(original) };
}

const RESPONSES: Readonly<Record<string, string>> = {
  accepted: "accepted", tentativelyAccepted: "tentative", declined: "declined", notResponded: "no response",
};

interface GraphAttendee {
  type?: string;
  status?: { response?: string; time?: string } | null;
  emailAddress?: { name?: string | null; address?: string | null } | null;
}

/** Graph attendees of one kind, one per line as the .ics parser writes them: "Name <address> · response". */
function attendeesOf(list: readonly object[], optional: boolean): string {
  return (list as readonly GraphAttendee[])
    .filter((a) => (a.type === "optional") === optional)
    .map((a) => {
      const address = a.emailAddress?.address?.trim() ?? "";
      const name = a.emailAddress?.name?.trim() ?? "";
      const who = name && address && name !== address ? `${name} <${address}>` : address || name;
      return [who, RESPONSES[a.status?.response ?? ""] ?? ""].filter(Boolean).join(" · ");
    })
    .filter((line) => line !== "")
    .join("\n");
}

const ATTENDEE_TYPES = new Set(["required", "optional", "resource"]);

/** Graph attendees as the stored list. */
const structured = (list: readonly object[]): Attendee[] => (list as readonly GraphAttendee[]).map((a) => ({
  name: a.emailAddress?.name?.trim() ?? "",
  address: a.emailAddress?.address?.trim() ?? "",
  type: (ATTENDEE_TYPES.has(a.type ?? "") ? a.type : "required") as Attendee["type"],
  response: RESPONSES[a.status?.response ?? ""] ?? "",
  respondedAt: a.status?.time && !a.status.time.startsWith("0001-") ? a.status.time : "",
})).filter((a) => a.name !== "" || a.address !== "");

/** Both attendee lists, or nothing when the payload has no attendees, so a missing list is not read as "none". */
function attendeeFields(event: DiaryEvent, masked: boolean): Pick<ImportedEvent, "requiredAttendees" | "optionalAttendees" | "attendees"> {
  if (!Array.isArray(event.attendees)) return {};
  if (masked) return { requiredAttendees: "", optionalAttendees: "", attendees: "[]" };
  return {
    requiredAttendees: attendeesOf(event.attendees, false), optionalAttendees: attendeesOf(event.attendees, true),
    attendees: JSON.stringify(structured(event.attendees)),
  };
}

const OWN_RESPONSES: Readonly<Record<string, string>> = { ...RESPONSES, organizer: "organizer", none: "" };
const IMPORTANCES = new Set(["low", "normal", "high"]);
const SENSITIVITY: Readonly<Record<string, string>> = { normal: "normal", personal: "normal", private: "private", confidential: "confidential" };

/** Sets each field the payload carries; leaves out what it doesn't, so an earlier import's value is kept. */
function carried<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

/** The v3 fields (OUT-83). A masked item keeps only its identity: no body, raw, links or people. */
function outlookFields(event: DiaryEvent, masked: boolean): Partial<ImportedEvent> {
  const kind: ImportedEvent["kind"] = event.type === "exception" ? "exception" : event.seriesMasterId ? "occurrence" : "single";
  const fields: Partial<ImportedEvent> = {
    source: "automate", kind, outlookId: carried(event.id),
    importance: event.importance && IMPORTANCES.has(event.importance) ? event.importance : undefined,
    sensitivity: SENSITIVITY[event.sensitivity],
    created: event.createdDateTime ? wholeSeconds(event.createdDateTime) : undefined,
    response: event.response === undefined || event.response === null ? undefined : OWN_RESPONSES[event.response] ?? "",
    isOrganizer: carried(event.isOrganizer), responseRequested: carried(event.responseRequested),
    allowNewTimeProposals: carried(event.allowNewTimeProposals),
  };
  if (masked) {
    const blank = <T,>(value: unknown, empty: T): T | undefined => (value === undefined || value === null ? undefined : empty);
    return {
      ...fields, raw: blank(event.raw, ""), body: blank(event.body, ""), webLink: blank(event.webLink, ""), joinUrl: blank(event.joinUrl, ""),
      organizerAddress: blank(event.organizerAddress, ""), locationType: blank(event.locationType, ""),
      online: blank(event.isOnlineMeeting, false), onlineProvider: blank(event.onlineMeetingProvider, ""),
      hasAttachments: blank(event.hasAttachments, false),
    };
  }
  return {
    ...fields, raw: carried(event.raw), body: carried(event.body), webLink: carried(event.webLink), joinUrl: carried(event.joinUrl),
    organizerAddress: carried(event.organizerAddress), locationType: carried(event.locationType),
    online: carried(event.isOnlineMeeting), onlineProvider: carried(event.onlineMeetingProvider),
    hasAttachments: carried(event.hasAttachments),
  };
}

/** Drops keys whose value is undefined, so `toEqual` and the diff see only what the payload carries. */
const defined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

function toImported(event: DiaryEvent, masters: ReadonlyMap<string, string>, zone: string, masked: boolean): ImportedEvent {
  if (!event.isAllDay && event.timeZone !== "UTC") {
    throw new Refusal(`"${event.subject}" is in time zone "${event.timeZone ?? ""}", not UTC. The flow's calendar read needs the header Prefer: outlook.timezone="UTC".`);
  }
  const at = (value: string): number => (event.isAllDay ? officeMidnight(value, zone) : utcMs(value));
  const startMs = at(event.start);
  const key = keyOf(event, masters, zone);
  const details = {
    subject: event.subject, location: event.location ?? "", organizer: event.organizer ?? "",
    categories: categoriesOf(event.categories), showAs: SHOW_AS[event.showAs] ?? "busy",
    sourceModified: wholeSeconds(event.lastModifiedDateTime),
  };
  return {
    ...key, start: toIso(startMs), end: toIso(Math.max(startMs, at(event.end))), allDay: event.isAllDay,
    ...details, ...(masked ? { subject: MASKED_SUBJECT, location: "", organizer: "", categories: "" } : {}), masked,
    ...attendeeFields(event, masked), ...defined(outlookFields(event, masked)),
    seriesId: event.seriesMasterId ? key.uid : "",
  };
}

const compareEvents = (a: ImportedEvent, b: ImportedEvent): number =>
  a.start.localeCompare(b.start) || a.uid.localeCompare(b.uid) || a.recurrenceId.localeCompare(b.recurrenceId);

function read(payload: DiaryPayload, options: AutomateParseOptions, warn: (m: string) => void): ParseResult {
  if (payload.events.length !== payload.count) {
    throw new Refusal(`The diary says it has ${payload.count} events but holds ${payload.events.length}, so it may be cut off.`);
  }
  const [windowStartMs, windowEndMs] = [utcMs(payload.windowStart), utcMs(payload.windowEnd)];
  const masters = new Map((payload.masters ?? []).map((m) => [m.id, m.iCalUId] as const));
  const masking = options.privatePolicy === "mask";
  let privateCount = 0;
  const seen = new Set<string>();
  const events: ImportedEvent[] = [];
  for (const item of payload.events) {
    if (item.type === "seriesMaster" || item.isCancelled === true) continue;
    const isPrivate = PRIVATE_SENSITIVITIES.has(item.sensitivity);
    const event = toImported(item, masters, options.timeZone, isPrivate);
    const startMs = Date.parse(event.start);
    if (startMs < windowStartMs || startMs >= windowEndMs) continue;
    if (isPrivate) privateCount += 1;
    if (isPrivate && !masking) continue;
    const key = eventKey(event);
    if (seen.has(key)) {
      warn(`UID ${event.uid} has the same occurrence more than once; only the first was used.`);
      continue;
    }
    seen.add(key);
    events.push(event);
  }
  return {
    events: events.sort(compareEvents),
    rangeStart: toIso(windowStartMs),
    rangeEnd: toIso(windowEndMs),
    droppedPrivate: masking ? 0 : privateCount,
    maskedPrivate: masking ? privateCount : 0,
    warnings: [],
  };
}

/**
 * Turns a diary payload into a ParseResult. Unlike an .ics file, the payload
 * says exactly which window it covers, so the range is that window: an event
 * deleted from the diary inside it shows as gone. A payload that can't be
 * keyed safely is refused whole (no events, one warning), never applied in part.
 */
export function parseAutomate(payload: DiaryPayload, options: AutomateParseOptions): ParseResult {
  const refused = (message: string): ParseResult => ({
    events: [], rangeStart: payload.windowStart, rangeEnd: payload.windowEnd, droppedPrivate: 0, maskedPrivate: 0, warnings: [message],
  });
  if (!isValidTimeZone(options.timeZone)) return refused(`"${options.timeZone}" is not a known time zone.`);
  const warnings = new Set<string>();
  try {
    const result = read(payload, options, (m) => warnings.add(m));
    return { ...result, warnings: [...warnings] };
  } catch (error: unknown) {
    if (error instanceof Refusal) return refused(`The diary update was not used: ${error.message}`);
    throw error;
  }
}
