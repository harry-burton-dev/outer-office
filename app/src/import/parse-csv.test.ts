// @vitest-environment node
import { describe, expect, test } from "vitest";
import { detectDateOrder, joinCsvToStored, parseCsv, readCsvRecords, CSV_UID_PREFIX, type CsvParseOptions } from "./parse-csv";
import { diffImport } from "./diff";
import { MASKED_SUBJECT } from "./event-fields";
import type { ImportedEvent, StoredEvent } from "./types";
import { CSV_WINDOW, UK_ROWS, US_ROWS, outlookCsv } from "./fixtures/outlook-csv";

const UK: CsvParseOptions = { ...CSV_WINDOW, privatePolicy: "mask", dateOrder: "dmy" };
const US: CsvParseOptions = { ...UK, dateOrder: "mdy" };
const ukText = outlookCsv(UK_ROWS);
const usText = outlookCsv(US_ROWS);
const bySubject = (events: readonly ImportedEvent[], subject: string) => events.find((e) => e.subject === subject);

let n = 0;
const stored = (event: ImportedEvent, extra: Partial<StoredEvent> = {}): StoredEvent =>
  ({ ...event, id: `ev-${++n}`, principal: "PRINCIPAL-A", gone: false, moves: 0, ...extra });

describe("reading the CSV text", () => {
  test("quoted fields keep commas, doubled quotes and line breaks, and a BOM is ignored", () => {
    const records = readCsvRecords(`﻿"a","b, c"\r\n"say ""hi""","line\r\nbreak"\r\n\r\n`);
    expect(records).toEqual([["a", "b, c"], ['say "hi"', "line\r\nbreak"]]);
  });
});

describe("date order", () => {
  test("a UK file is detected as day/month/year and a US file as month/day/year", () => {
    expect(detectDateOrder(ukText)).toBe("dmy");
    expect(detectDateOrder(usText)).toBe("mdy");
  });

  test("a file whose every date reads both ways is unknown, so a person must say", () => {
    expect(detectDateOrder(outlookCsv([{ subject: "x", startDate: "05/11/2026", startTime: "09:00:00", endTime: "10:00:00" }]))).toBe("unknown");
  });

  test("the UK and US exports of the same week read as the same events", () => {
    const uk = parseCsv(ukText, UK);
    expect(uk.warnings).toEqual([]);
    expect(uk.events).toHaveLength(6);
    const fields = ({ raw: _raw, ...rest }: ImportedEvent) => rest;
    expect(parseCsv(usText, US).events.map(fields)).toEqual(uk.events.map(fields));
  });

  test("the wrong order skips dates that can't exist, with a warning", () => {
    const wrong = parseCsv(ukText, US);
    expect(wrong.events.map((e) => e.subject)).toEqual(["Lunch"]);
    expect(wrong.warnings.some((w) => w.includes('"Weekly team meeting" has a start date "23/11/2026"'))).toBe(true);
  });
});

describe("fields", () => {
  const events = parseCsv(ukText, UK).events;

  test("a timed event is read in the office zone and carries its details", () => {
    expect(bySubject(events, "Weekly team meeting")).toEqual({
      uid: `${CSV_UID_PREFIX}2026-11-23T09:00:00.000Z|Weekly team meeting|Alex Example`, recurrenceId: "",
      start: "2026-11-23T09:00:00.000Z", end: "2026-11-23T10:00:00.000Z", allDay: false, subject: "Weekly team meeting",
      location: "Room 1", organizer: "Alex Example", categories: "Internal, Team", showAs: "busy", masked: false, sourceModified: "",
      source: "csv", kind: "single", seriesId: "", body: expect.any(String), raw: expect.any(String),
    });
    expect(JSON.parse(bySubject(events, "Weekly team meeting")?.raw ?? "")).toMatchObject({ Subject: "Weekly team meeting" });
  });

  test("British Summer Time is applied to summer dates", () => {
    const summer = parseCsv(outlookCsv([{ subject: "Summer", startDate: "15/07/2026", startTime: "09:00:00", endTime: "10:00:00" }]), UK).events[0];
    expect(summer?.start).toBe("2026-07-15T08:00:00.000Z");
  });

  test("an all-day event runs from local midnight to the midnight after its last day", () => {
    const conference = bySubject(events, "Conference");
    expect(conference).toMatchObject({ allDay: true, start: "2026-11-25T00:00:00.000Z", end: "2026-11-27T00:00:00.000Z", showAs: "oof" });
  });

  test("a one-day all-day event with the same start and end date lasts the day", () => {
    const day = parseCsv(outlookCsv([{ subject: "Away", startDate: "30/11/2026", endDate: "30/11/2026", allDay: true }]), UK).events[0];
    expect(day).toMatchObject({ start: "2026-11-30T00:00:00.000Z", end: "2026-12-01T00:00:00.000Z" });
  });

  test("quotes and commas survive in a location, and Show time as maps to free, tentative and busy", () => {
    expect(bySubject(events, "Visit: Northfield Works")?.location).toBe('Northfield, "Main" gate');
    expect(bySubject(events, "Hold for calls")?.showAs).toBe("tentative");
    expect(bySubject(events, "Lunch")?.showAs).toBe("free");
  });

  test("12-hour times with AM and PM read correctly", () => {
    expect(bySubject(parseCsv(usText, US).events, "Visit: Northfield Works")?.start).toBe("2026-11-24T14:30:00.000Z");
  });
});

describe("private events", () => {
  test("mask keeps the time and hides the details, and the ID is not made from them", () => {
    const result = parseCsv(ukText, UK);
    const masked = result.events.filter((e) => e.masked);
    expect(result.maskedPrivate).toBe(1);
    expect(masked).toEqual([expect.objectContaining({ subject: MASKED_SUBJECT, location: "", organizer: "", start: "2026-11-26T08:00:00.000Z" })]);
    expect(masked[0]?.uid).not.toContain("Doctor");
  });

  test("drop leaves them out and counts them", () => {
    const result = parseCsv(ukText, { ...UK, privatePolicy: "drop" });
    expect(result.events.some((e) => e.masked)).toBe(false);
    expect(result.droppedPrivate).toBe(1);
  });

  test("Sensitivity Private or Confidential counts as private even when Private is False", () => {
    const text = outlookCsv([{ subject: "Board", startDate: "24/11/2026", startTime: "10:00:00", endTime: "11:00:00", sensitivity: "Confidential" }]);
    expect(parseCsv(text, UK).events[0]?.masked).toBe(true);
  });
});

describe("refusals", () => {
  test("a file with no Subject or Start Date column is refused with a plain reason", () => {
    const result = parseCsv("Name,Email\r\nA,b@example.com\r\n", UK);
    expect(result.events).toEqual([]);
    expect(result.warnings).toEqual(['The file is not an Outlook calendar CSV: it has no "Subject" or "Start Date" column.']);
  });

  test("events outside the window are left out, and the range is the file's own span", () => {
    const result = parseCsv(ukText, { ...UK, windowEnd: "2026-11-24T00:00:00.000Z" });
    expect(result.events.map((e) => e.subject)).toEqual(["Lunch", "Weekly team meeting"]);
    expect([result.rangeStart, result.rangeEnd]).toEqual(["2026-11-05T12:00:00.000Z", "2026-11-23T10:00:00.000Z"]);
  });
});

describe("joining to the stored diary by ID", () => {
  const icsLike = (event: ImportedEvent, uid: string): ImportedEvent => ({ ...event, uid, sourceModified: "2026-11-01T10:00:00.000Z" });

  test("a row takes the ID and sourceModified of the stored event with the same start and subject, so nothing changes", () => {
    const parsed = parseCsv(ukText, UK);
    const before = parsed.events.map((e, i) => stored(icsLike(e, `OUTLOOK-${i}`)));
    const joined = joinCsvToStored(parsed, before);
    expect(joined.events.every((e) => e.uid.startsWith("OUTLOOK-"))).toBe(true);
    const diff = diffImport(before, joined);
    expect({ added: diff.added, changed: diff.changed, gone: diff.gone }).toEqual({ added: [], changed: [], gone: [] });
    expect(diff.unchanged).toBe(6);
  });

  test("a changed location is a change to the same event, not a new one", () => {
    const parsed = parseCsv(ukText, UK);
    const before = parsed.events.map((e, i) => stored(icsLike(e, `OUTLOOK-${i}`)));
    const edited = parseCsv(outlookCsv(UK_ROWS.map((r) => (r.subject === "Lunch" ? { ...r, location: "Canteen" } : r))), UK);
    const diff = diffImport(before, joinCsvToStored(edited, before));
    expect(diff.changed.map((c) => [c.after.subject, c.fields])).toEqual([["Lunch", ["location"]]]);
  });

  test("a re-import of the same CSV keeps its derived IDs and diffs to no change", () => {
    const first = parseCsv(ukText, UK);
    const before = first.events.map((e) => stored(e));
    const diff = diffImport(before, joinCsvToStored(parseCsv(ukText, UK), before));
    expect(diff.unchanged).toBe(6);
    expect(diff.added.length + diff.changed.length + diff.gone.length).toBe(0);
  });

  test("a moved meeting has no ID to follow, so it reads as gone plus added", () => {
    const before = parseCsv(ukText, UK).events.map((e) => stored(e));
    const moved = parseCsv(outlookCsv(UK_ROWS.map((r) => (r.subject === "Hold for calls" ? { ...r, startTime: "15:00:00", endTime: "16:00:00" } : r))), UK);
    const diff = diffImport(before, joinCsvToStored(moved, before));
    expect(diff.gone.map((e) => e.subject)).toEqual(["Hold for calls"]);
    expect(diff.added.map((e) => e.subject)).toEqual(["Hold for calls"]);
  });

  test("an event an earlier CSV stored keeps its ID, and a twin row is not given it too", () => {
    const parsed = parseCsv(outlookCsv([
      { subject: "Call", startDate: "24/11/2026", startTime: "10:00:00", endTime: "10:30:00", organizer: "A" },
      { subject: "Call", startDate: "24/11/2026", startTime: "10:00:00", endTime: "10:30:00", organizer: "B" },
    ]), UK);
    const joined = joinCsvToStored(parsed, [stored(parsed.events[0] as ImportedEvent)]);
    expect(new Set(joined.events.map((e) => e.uid)).size).toBe(2);
  });

  test("the subject match ignores case and spaces at the ends", () => {
    const parsed = parseCsv(ukText, UK);
    const lunch = parsed.events.find((e) => e.subject === "Lunch") as ImportedEvent;
    const joined = joinCsvToStored(parsed, [stored(icsLike({ ...lunch, subject: " LUNCH" }, "OUTLOOK-L"))]);
    expect(joined.events.find((e) => e.subject === "Lunch")?.uid).toBe("OUTLOOK-L");
  });

  test("each stored event is taken at most once", () => {
    const parsed = parseCsv(outlookCsv([
      { subject: "Call", startDate: "24/11/2026", startTime: "10:00:00", endTime: "10:30:00", organizer: "A" },
      { subject: "Call", startDate: "24/11/2026", startTime: "10:00:00", endTime: "10:30:00", organizer: "B" },
    ]), UK);
    const only = stored(icsLike(parsed.events[0] as ImportedEvent, "OUTLOOK-1"));
    const joined = joinCsvToStored(parsed, [only]);
    expect(joined.events.filter((e) => e.uid === "OUTLOOK-1")).toHaveLength(1);
    expect(joined.events.filter((e) => e.uid.startsWith(CSV_UID_PREFIX))).toHaveLength(1);
  });
});
