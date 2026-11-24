// Reads Outlook's CSV export (File > Open & Export > Import/Export > Export to
// a file > Comma Separated Values) into the same ParseResult the .ics parser
// returns, so every source shares one diff and one review. Pure: no I/O, no clock.
//
// Outlook's CSV has no event ID, and every event must join by one. So a row is
// joined to the stored event it matches (same start and subject), taking that
// event's ID; see joinCsvToStored. A row that matches nothing gets an ID made
// from its own start, subject and organizer, which a later CSV import of the
// same row gives again. A moved meeting therefore reads as gone plus added.
import type { ImportedEvent, StoredEvent } from "./types";
import { eventKey } from "./types";
import type { ParseOptions, ParseResult } from "./parse-ics";
import { MASKED_SUBJECT } from "./event-fields";
import { isValidTimeZone, toIso, wallClockToUtc } from "./zoned-time";

/** Day/month/year (UK and most of the world) or month/day/year (US), as the exporting computer's locale wrote them. */
export type DateOrder = "dmy" | "mdy";

export interface CsvParseOptions extends ParseOptions {
  dateOrder: DateOrder;
}

/** The prefix of an ID made from a CSV row's own fields. */
export const CSV_UID_PREFIX = "csv:";

const SHOW_AS: Readonly<Record<string, string>> = {
  "0": "free", "1": "tentative", "2": "busy", "3": "oof", "4": "busy",
  free: "free", tentative: "tentative", busy: "busy", "out of office": "oof", oof: "oof", "working elsewhere": "busy",
};
const PRIVATE_SENSITIVITIES = new Set(["private", "confidential"]);
const TRUE = /^(true|yes|1)$/i;

/** RFC 4180 records: quoted fields may hold commas, quotes ("") and line breaks. */
export function readCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  const body = text.replace(/^﻿/, "");
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { record.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i += 1;
      record.push(field); records.push(record); record = []; field = "";
    } else field += ch;
  }
  if (field !== "" || record.length > 0) { record.push(field); records.push(record); }
  return records.filter((r) => r.some((f) => f.trim() !== ""));
}

const DATE = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/;
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i;

interface Day { year: number; month: number; day: number }

function readDate(value: string, order: DateOrder): Day | undefined {
  const m = DATE.exec(value.trim());
  if (!m) return undefined;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ymd = (m[1] ?? "").length === 4;
  const [year, month, day] = ymd ? [a, b, c] : order === "dmy" ? [c, b, a] : [c, a, b];
  const fullYear = year < 100 ? 2000 + year : year;
  const check = new Date(Date.UTC(fullYear, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return undefined;
  return { year: fullYear, month, day };
}

function readTime(value: string): { hour: number; minute: number; second: number } | undefined {
  if (value.trim() === "") return { hour: 0, minute: 0, second: 0 };
  const m = TIME.exec(value.trim());
  if (!m) return undefined;
  let hour = Number(m[1]);
  const meridiem = (m[4] ?? "").toLowerCase().replace(/\./g, "");
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  const [minute, second] = [Number(m[2]), Number(m[3] ?? 0)];
  return hour > 23 || minute > 59 || second > 59 ? undefined : { hour, minute, second };
}

/**
 * The date order the file must use, or "unknown" when every date reads both
 * ways (all days 12 or under) and a person has to say.
 */
export function detectDateOrder(text: string): DateOrder | "unknown" {
  const [header, ...rows] = readCsvRecords(text);
  if (!header) return "unknown";
  const columns = header.map((h) => h.trim().toLowerCase());
  const dateColumns = ["start date", "end date"].map((name) => columns.indexOf(name)).filter((i) => i >= 0);
  let dmy = false;
  let mdy = false;
  for (const row of rows) {
    for (const i of dateColumns) {
      const m = DATE.exec((row[i] ?? "").trim());
      if (!m || (m[1] ?? "").length === 4) continue;
      if (Number(m[1]) > 12) dmy = true;
      if (Number(m[2]) > 12) mdy = true;
    }
  }
  return dmy === mdy ? "unknown" : dmy ? "dmy" : "mdy";
}

const midnight = (day: Day, zone: string): number => wallClockToUtc({ ...day, hour: 0, minute: 0, second: 0 }, zone);

function nextDay(day: Day): Day {
  const d = new Date(Date.UTC(day.year, day.month - 1, day.day + 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const categoriesOf = (value: string): string => value.split(/[;,]/).map((c) => c.trim()).filter((c) => c !== "").join(", ");

/** The ID a row gets when it matches no stored event. Never built from a private row's details. */
export function derivedUid(event: Pick<ImportedEvent, "start" | "end" | "subject" | "organizer" | "masked">): string {
  return event.masked
    ? `${CSV_UID_PREFIX}${event.start}|${event.end}|private`
    : `${CSV_UID_PREFIX}${event.start}|${event.subject.trim()}|${event.organizer.trim()}`;
}

class SkipRow extends Error {}

interface Row { get(name: string): string }

function readRow(row: Row, options: CsvParseOptions): { event: ImportedEvent; isPrivate: boolean } {
  const zone = options.timeZone;
  const subject = row.get("subject");
  const startDay = readDate(row.get("start date"), options.dateOrder);
  if (!startDay) throw new SkipRow(`"${subject}" has a start date "${row.get("start date")}" that could not be read and was skipped.`);
  const endDay = row.get("end date").trim() === "" ? startDay : readDate(row.get("end date"), options.dateOrder);
  if (!endDay) throw new SkipRow(`"${subject}" has an end date "${row.get("end date")}" that could not be read and was skipped.`);
  const allDay = TRUE.test(row.get("all day event").trim());
  let startMs: number;
  let endMs: number;
  if (allDay) {
    startMs = midnight(startDay, zone);
    endMs = midnight(endDay, zone);
    if (endMs <= startMs) endMs = midnight(nextDay(startDay), zone);
  } else {
    const [startTime, endTime] = [readTime(row.get("start time")), readTime(row.get("end time"))];
    if (!startTime || !endTime) throw new SkipRow(`"${subject}" has a time that could not be read and was skipped.`);
    startMs = wallClockToUtc({ ...startDay, ...startTime }, zone);
    endMs = Math.max(startMs, wallClockToUtc({ ...endDay, ...endTime }, zone));
  }
  const isPrivate = TRUE.test(row.get("private").trim()) || PRIVATE_SENSITIVITIES.has(row.get("sensitivity").trim().toLowerCase());
  const details = isPrivate
    ? { subject: MASKED_SUBJECT, location: "", organizer: "", categories: "" }
    : { subject, location: row.get("location"), organizer: row.get("meeting organizer").trim(), categories: categoriesOf(row.get("categories")) };
  const base = {
    recurrenceId: "", start: toIso(startMs), end: toIso(endMs), allDay, ...details,
    showAs: SHOW_AS[row.get("show time as").trim().toLowerCase()] ?? "busy", masked: isPrivate, sourceModified: "",
  };
  return { event: { uid: derivedUid(base), ...base }, isPrivate };
}

const compareEvents = (a: ImportedEvent, b: ImportedEvent): number =>
  a.start.localeCompare(b.start) || a.uid.localeCompare(b.uid) || a.recurrenceId.localeCompare(b.recurrenceId);

export function parseCsv(text: string, options: CsvParseOptions): ParseResult {
  const empty = (warning: string): ParseResult => ({
    events: [], rangeStart: options.windowStart, rangeEnd: options.windowEnd, droppedPrivate: 0, maskedPrivate: 0, warnings: [warning],
  });
  const [windowStartMs, windowEndMs] = [Date.parse(options.windowStart), Date.parse(options.windowEnd)];
  if (Number.isNaN(windowStartMs) || Number.isNaN(windowEndMs)) return empty("The import window is not a valid date range.");
  if (!isValidTimeZone(options.timeZone)) return empty(`"${options.timeZone}" is not a known time zone.`);
  const [header, ...rows] = readCsvRecords(text);
  const columns = (header ?? []).map((h) => h.trim().toLowerCase());
  const missing = ["subject", "start date"].filter((c) => !columns.includes(c));
  if (missing.length > 0) return empty(`The file is not an Outlook calendar CSV: it has no ${missing.map((c) => `"${c.replace(/\b\w/g, (l) => l.toUpperCase())}"`).join(" or ")} column.`);
  const warnings = new Set<string>();
  const masking = options.privatePolicy === "mask";
  let privateCount = 0;
  const seen = new Set<string>();
  const events: ImportedEvent[] = [];
  for (const record of rows) {
    const row: Row = { get: (name) => { const i = columns.indexOf(name); return i < 0 ? "" : (record[i] ?? ""); } };
    let read: ReturnType<typeof readRow>;
    try {
      read = readRow(row, options);
    } catch (error: unknown) {
      if (error instanceof SkipRow) { warnings.add(error.message); continue; }
      throw error;
    }
    const startMs = Date.parse(read.event.start);
    if (startMs < windowStartMs || startMs >= windowEndMs) continue;
    if (read.isPrivate) privateCount += 1;
    if (read.isPrivate && !masking) continue;
    const key = eventKey(read.event);
    if (seen.has(key)) {
      warnings.add(`"${read.event.subject}" at ${read.event.start} appears more than once; only the first was used.`);
      continue;
    }
    seen.add(key);
    events.push(read.event);
  }
  events.sort(compareEvents);
  const earliest = events[0];
  return {
    events,
    rangeStart: earliest ? earliest.start : options.windowStart,
    rangeEnd: earliest ? events.reduce((max, e) => (e.end > max ? e.end : max), earliest.end) : options.windowEnd,
    droppedPrivate: masking ? 0 : privateCount,
    maskedPrivate: masking ? privateCount : 0,
    warnings: [...warnings],
  };
}

const matchKey = (e: Pick<ImportedEvent, "start" | "end" | "subject" | "masked">): string =>
  e.masked ? `${Date.parse(e.start)}|${Date.parse(e.end)}|private` : `${Date.parse(e.start)}|${e.subject.trim().toLowerCase()}`;

/**
 * Gives each CSV event the ID of the stored event it is, so a CSV import joins
 * the diary that .ics or the sync built. A row whose derived ID is already
 * stored keeps it. Otherwise it takes the ID of the one stored event with the
 * same start and subject (start and end for a private one), and that event's
 * sourceModified, since CSV has none. Each stored event is taken at most once.
 */
export function joinCsvToStored(parsed: ParseResult, stored: readonly StoredEvent[]): ParseResult {
  const storedKeys = new Set(stored.map(eventKey));
  const fileKeys = new Set(parsed.events.map(eventKey));
  const candidates = new Map<string, StoredEvent[]>();
  for (const event of stored) {
    if (fileKeys.has(eventKey(event))) continue;
    const list = candidates.get(matchKey(event)) ?? [];
    list.push(event);
    candidates.set(matchKey(event), list);
  }
  const events = parsed.events.map((event) => {
    if (storedKeys.has(eventKey(event))) return event;
    const match = candidates.get(matchKey(event))?.shift();
    return match ? { ...event, uid: match.uid, recurrenceId: match.recurrenceId, sourceModified: match.sourceModified } : event;
  });
  return { ...parsed, events: events.sort(compareEvents) };
}
