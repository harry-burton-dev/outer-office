// Reads one diary-sync file: the body of Graph's calendarView response,
// exactly as the flow's "Send an HTTP request" returned it. Power Automate does
// nothing to it, so everything a flow used to do happens here: the window,
// the shape check, the series UIDs and the field mapping. Masking private
// items, keying and the diff stay in parseAutomate and the import. Pure.
import type { DiaryEvent, DiaryPayload } from "@/import/parse-automate";

/** The flow reads from this many days before the run's UTC day to this many after it. See docs/automate/README.md. */
export const WINDOW_DAYS_BEFORE = 7;
export const WINDOW_DAYS_AFTER = 60;
const DAY_MS = 86_400_000;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string";
const textOrNull = (value: unknown): string | null => (isText(value) ? value : null);
const boolOrNull = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const SENSITIVITIES = new Set(["normal", "personal", "private", "confidential"]);

/** "20261124T090000Z.json", or a conflict copy such as "20261124T090000Z (1).json", gives the run's time. */
export function stampOf(fileName: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\b/.exec(fileName);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** The window the flow's URL asked for, from the run's time. */
export function windowOf(generatedAt: string): { windowStart: string; windowEnd: string } {
  const day = Math.floor(Date.parse(generatedAt) / DAY_MS) * DAY_MS;
  return {
    windowStart: new Date(day - WINDOW_DAYS_BEFORE * DAY_MS).toISOString(),
    windowEnd: new Date(day + WINDOW_DAYS_AFTER * DAY_MS).toISOString(),
  };
}

// An Outlook global object id: a fixed 16-byte prefix, then the instance date
// (year high, year low, month, day). Graph gives each occurrence its own
// iCalUId with that date filled in; with it zeroed, it is the series UID that
// Outlook's .ics export writes (MS-OXCICAL, UID property).
const GOID = /^040000008200E00074C5B7101A82E008[0-9A-F]{8}[0-9A-F]{42,}$/i;
const seriesUidOf = (iCalUId: string): string => (GOID.test(iCalUId) ? `${iCalUId.slice(0, 32)}00000000${iCalUId.slice(40)}` : iCalUId);

/** One { id, iCalUId } per series: the UID all its occurrences agree on, or the series id when they don't. */
function mastersOf(events: readonly DiaryEvent[]): { id: string; iCalUId: string }[] {
  const uids = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.seriesMasterId) continue;
    const set = uids.get(e.seriesMasterId) ?? new Set<string>();
    set.add(seriesUidOf(e.iCalUId));
    uids.set(e.seriesMasterId, set);
  }
  return [...uids].map(([id, set]) => ({ id, iCalUId: set.size === 1 ? [...set][0] ?? id : `graph-series:${id}` }));
}

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/**
 * The body as plain text (D7). The flow asks for text with the header
 * Prefer: outlook.body-content-type="text"; if that header is missing Graph
 * sends HTML, which is reduced to its text here, so markup is never stored.
 */
function plainBody(body: Json): string {
  const content = textOrNull(body.content) ?? "";
  if (String(body.contentType ?? "").toLowerCase() !== "html") return content.replace(/\r\n/g, "\n").trim();
  return content
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name: string) => ENTITIES[name] ?? "")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

interface GraphTime { dateTime?: unknown; timeZone?: unknown }

/** One Graph event as the adapter's DiaryEvent, or why it can't be read. */
function toDiaryEvent(raw: unknown): DiaryEvent | string {
  if (!isObject(raw)) return "an event is not an object";
  for (const key of ["iCalUId", "type", "showAs", "lastModifiedDateTime"]) {
    if (!isText(raw[key])) return `an event has no ${key}. Check the $select in the flow's URL`;
  }
  const start = raw.start as GraphTime | undefined;
  const end = raw.end as GraphTime | undefined;
  if (!isObject(start) || !isText(start.dateTime) || !isObject(end) || !isText(end.dateTime)) return "an event has no start or end time";
  if (typeof raw.isAllDay !== "boolean") return "an event's isAllDay is not true or false";
  if (!isText(raw.sensitivity) || !SENSITIVITIES.has(raw.sensitivity)) return "an event's sensitivity is not one of normal, personal, private or confidential";
  const location = isObject(raw.location) ? textOrNull(raw.location.displayName) : null;
  const who: Json = isObject(raw.organizer) && isObject(raw.organizer.emailAddress) ? raw.organizer.emailAddress : {};
  const categories = Array.isArray(raw.categories) ? raw.categories.filter(isText) : null;
  return {
    iCalUId: raw.iCalUId as string,
    type: raw.type as DiaryEvent["type"],
    seriesMasterId: textOrNull(raw.seriesMasterId),
    originalStart: textOrNull(raw.originalStart),
    start: start.dateTime,
    end: end.dateTime,
    timeZone: textOrNull(start.timeZone),
    isAllDay: raw.isAllDay,
    isCancelled: typeof raw.isCancelled === "boolean" ? raw.isCancelled : null,
    subject: textOrNull(raw.subject) ?? "",
    location,
    organizer: textOrNull(who.name) || textOrNull(who.address),
    categories,
    showAs: raw.showAs as string,
    sensitivity: raw.sensitivity as DiaryEvent["sensitivity"],
    lastModifiedDateTime: raw.lastModifiedDateTime as string,
    attendees: Array.isArray(raw.attendees) ? (raw.attendees as object[]) : null,
    // The widened $select (OUT-83). Each is null when the flow didn't ask for it.
    id: textOrNull(raw.id),
    importance: textOrNull(raw.importance),
    createdDateTime: textOrNull(raw.createdDateTime),
    response: isObject(raw.responseStatus) ? textOrNull(raw.responseStatus.response) : null,
    isOnlineMeeting: boolOrNull(raw.isOnlineMeeting),
    onlineMeetingProvider: "onlineMeetingProvider" in raw ? textOrNull(raw.onlineMeetingProvider) ?? "" : null,
    joinUrl: "onlineMeeting" in raw ? (isObject(raw.onlineMeeting) ? textOrNull(raw.onlineMeeting.joinUrl) : null) ?? "" : null,
    hasAttachments: boolOrNull(raw.hasAttachments),
    webLink: textOrNull(raw.webLink),
    isOrganizer: boolOrNull(raw.isOrganizer),
    responseRequested: boolOrNull(raw.responseRequested),
    allowNewTimeProposals: boolOrNull(raw.allowNewTimeProposals),
    organizerAddress: isObject(raw.organizer) ? textOrNull(who.address) ?? "" : null,
    locationType: isObject(raw.location) ? textOrNull(raw.location.locationType) ?? "" : null,
    body: isObject(raw.body) ? plainBody(raw.body) : null,
    raw: JSON.stringify(raw),
  };
}

/** A diary-sync file's payload, or why it can't be used. */
export function readGraphCalendar(
  value: unknown, principal: string, fileName: string,
): { ok: true; generatedAt: string; payload: DiaryPayload; note?: string } | { ok: false; reason: string } {
  const generatedAt = stampOf(fileName);
  if (!generatedAt) return { ok: false, reason: `its name "${fileName}" is not the time the flow ran, as yyyyMMddTHHmmssZ.json` };
  if (isObject(value) && isObject(value.error)) return { ok: false, reason: `it holds an error from Outlook: ${String(value.error.message ?? value.error.code ?? "no message").replace(/\.$/, "")}` };
  if (!isObject(value) || !Array.isArray(value.value)) return { ok: false, reason: "it is not the response of a calendarView request" };
  const events: DiaryEvent[] = [];
  for (const raw of value.value) {
    const event = toDiaryEvent(raw);
    if (typeof event === "string") return { ok: false, reason: event };
    events.push(event);
  }
  const window = windowOf(generatedAt);
  if (value["@odata.nextLink"] !== undefined) {
    // Outlook can split its answer into pages even with $top=999 (OUT-92). The
    // flow saves only the first page, so the app uses the part of the window it covers.
    const cut = firstPageEnd(events, window.windowStart);
    if (typeof cut !== "string") return { ok: false, reason: cut.reason };
    const payload = { principal, windowStart: window.windowStart, windowEnd: cut, count: events.length, masters: mastersOf(events), events };
    const note = `Outlook sent the diary in pages, and the file holds the first ${events.length} events, so only the days before ${cut.slice(0, 10)} were updated`;
    return { ok: true, generatedAt, payload, note };
  }
  return { ok: true, generatedAt, payload: { principal, ...window, count: events.length, masters: mastersOf(events), events } };
}

/**
 * Where a first page's events stop, as the window's new end: the UTC day
 * before its last event's day, so an event on the page's last days that came
 * on the next page is never marked gone. Needs the events in start order,
 * which the URL's $orderby=start/dateTime asks for, and times in UTC.
 */
function firstPageEnd(events: readonly DiaryEvent[], windowStart: string): string | { reason: string } {
  const pages = `Outlook sent the diary in pages (${events.length} events in the first)`;
  if (events.some((e) => (e.timeZone ?? "UTC") !== "UTC")) return { reason: `${pages}, not in UTC, so the app can't tell which days it covers. Add the Prefer header outlook.timezone="UTC"` };
  const ordered = events.every((e, i) => i === 0 || (events[i - 1]?.start ?? "") <= e.start);
  if (!ordered) return { reason: `${pages}, not in date order, so the app can't tell which days are missing. Add &$orderby=start/dateTime to the end of the flow's URL` };
  const last = events[events.length - 1];
  const end = last ? Math.floor(Date.parse(`${last.start.slice(0, 19)}Z`) / DAY_MS) * DAY_MS - DAY_MS : NaN;
  if (Number.isNaN(end) || end <= Date.parse(windowStart)) return { reason: `${pages}, too few to cover a whole day` };
  return new Date(end).toISOString();
}
