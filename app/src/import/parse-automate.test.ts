// @vitest-environment node
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { parseAutomate, type AutomateParseOptions, type DiaryEvent, type DiaryPayload } from "./parse-automate";
import { parseIcs } from "./parse-ics";
import { diffImport } from "./diff";
import type { ImportedEvent, StoredEvent } from "./types";
import { MAIN_PAYLOAD, MASTER_ID, occurrence } from "./fixtures/diary-payload";
import { MAIN_FIXTURE, MAIN_WINDOW, UID } from "./fixtures/outlook-ics";

const MASK: AutomateParseOptions = { timeZone: MAIN_WINDOW.timeZone, privatePolicy: "mask" };
const DROP: AutomateParseOptions = { ...MASK, privatePolicy: "drop" };
const S = (date: string): string => `2026-${date}:00.000Z`;

const withEvents = (events: readonly DiaryEvent[], extra: Partial<DiaryPayload> = {}): DiaryPayload =>
  ({ ...MAIN_PAYLOAD, events, count: events.length, ...extra });
const find = (uid: string, options = MASK) => parseAutomate(MAIN_PAYLOAD, options).events.filter((e) => e.uid === uid);

let n = 0;
const stored = (event: ImportedEvent): StoredEvent => ({ ...event, id: `ev-${++n}`, principal: "PRINCIPAL-A", gone: false, moves: 0 });

describe("cross-source keys: the .ics file and the diary payload for the same diary", () => {
  test("give identical events, field for field", () => {
    // The .ics file also carries the meeting panel's detail fields (OUT-78), which the
    // diary payload does not have yet; the two must agree on everything else.
    const shared = ({ requiredAttendees: _r, optionalAttendees: _o, importance: _i, sensitivity: _s, created: _c, ...rest }: ImportedEvent) => rest;
    const fromIcs = parseIcs(MAIN_FIXTURE, { ...MAIN_WINDOW, privatePolicy: "mask" }).events.map(shared);
    const fromPayload = parseAutomate(MAIN_PAYLOAD, MASK).events;
    expect(fromPayload).toHaveLength(23);
    expect(fromPayload).toEqual(fromIcs);
  });

  test("switching a principal from .ics to sync diffs to no change at all", () => {
    const before = parseIcs(MAIN_FIXTURE, { ...MAIN_WINDOW, privatePolicy: "mask" }).events.map(stored);
    const diff = diffImport(before, parseAutomate(MAIN_PAYLOAD, MASK));
    expect({ added: diff.added, changed: diff.changed, gone: diff.gone, returned: diff.returned }).toEqual({ added: [], changed: [], gone: [], returned: [] });
    expect(diff.unchanged).toBe(23);
  });
});

describe("the fixture is the protocol's example", () => {
  test("docs/automate/examples/diary-payload-outlook-fixture.json is this fixture, so the schema test covers it", () => {
    const example: unknown = JSON.parse(readFileSync(new URL("../../../docs/automate/examples/diary-payload-outlook-fixture.json", import.meta.url), "utf8"));
    expect(example).toEqual(JSON.parse(JSON.stringify(MAIN_PAYLOAD)));
  });
});

describe("parseAutomate", () => {
  test("keys occurrences by the master's iCalUId and the original start, not their own iCalUId", () => {
    expect(find(UID.standUp).map((e) => e.recurrenceId)).toEqual(
      ["10-12", "10-13", "10-15", "10-16", "10-19", "10-20", "10-22", "10-23"].map((d) => S(`${d}T07:30`)));
    expect(parseAutomate(MAIN_PAYLOAD, MASK).events.some((e) => e.uid.startsWith("occ-"))).toBe(false);
  });

  test("a moved instance (exception) keeps its original start as recurrenceId", () => {
    const moved = find(UID.projectSync).find((e) => e.recurrenceId === S("10-22T13:00"));
    expect(moved).toMatchObject({ start: S("10-23T10:00"), end: S("10-23T11:00"), sourceModified: S("10-10T09:00") });
  });

  test("all-day events run local midnight to local midnight in the office zone", () => {
    expect(find(UID.officeClosed)[0]).toMatchObject({ allDay: true, start: S("10-15T23:00"), end: S("10-16T23:00"), showAs: "free" });
    expect(find(UID.conference)[0]).toMatchObject({ start: S("10-22T23:00"), end: S("10-27T00:00"), showAs: "oof" });
  });

  test("an all-day day given as local midnight in UTC reads as the same day", () => {
    const event = { ...MAIN_PAYLOAD.events[0], seriesMasterId: null, iCalUId: "x", isAllDay: true,
      start: "2026-10-15T23:00:00.0000000", end: "2026-10-16T23:00:00.0000000" } as DiaryEvent;
    expect(parseAutomate(withEvents([event]), MASK).events[0]).toMatchObject({ start: S("10-15T23:00"), end: S("10-16T23:00") });
  });

  test("an all-day occurrence's recurrenceId is local midnight, as in the .ics", () => {
    const event = occurrence(MASTER_ID.standUp, "10-16T00:00", "10-16T00:00", "10-17T00:00", { isAllDay: true });
    expect(parseAutomate(withEvents([event]), MASK).events[0]?.recurrenceId).toBe(S("10-15T23:00"));
  });

  test("private items: mask gives the app's masked text, drop leaves them out, and each is counted", () => {
    expect(find(UID.personal)[0]).toMatchObject({ subject: "Private, busy", location: "", organizer: "", categories: "", masked: true });
    expect(parseAutomate(MAIN_PAYLOAD, MASK).maskedPrivate).toBe(1);
    const dropped = parseAutomate(MAIN_PAYLOAD, DROP);
    expect(find(UID.personal, DROP)).toEqual([]);
    expect([dropped.events.length, dropped.droppedPrivate, dropped.maskedPrivate]).toEqual([22, 1, 0]);
  });

  test("a confidential item the flow failed to mask is still masked", () => {
    const leaked = { ...MAIN_PAYLOAD.events[0], seriesMasterId: null, iCalUId: "x", subject: "Secret", location: "Here", sensitivity: "confidential" } as DiaryEvent;
    expect(parseAutomate(withEvents([leaked]), MASK).events[0]).toMatchObject({ subject: "Private, busy", location: "", organizer: "", masked: true });
  });

  test("cancelled items are left out", () => {
    expect(find(UID.supplierCall)).toEqual([]);
  });

  test("keeps windowStart <= start < windowEnd, and the range is the payload's window", () => {
    const early = { ...MAIN_PAYLOAD.events[0], seriesMasterId: null, iCalUId: "early", start: "2026-10-11T22:00:00.0000000", end: "2026-10-12T09:00:00.0000000" } as DiaryEvent;
    const result = parseAutomate(withEvents([early]), MASK);
    expect(result.events).toEqual([]);
    expect([result.rangeStart, result.rangeEnd]).toEqual([MAIN_WINDOW.windowStart, MAIN_WINDOW.windowEnd]);
  });

  test("an event deleted from the diary shows as gone", () => {
    const before = parseIcs(MAIN_FIXTURE, { ...MAIN_WINDOW, privatePolicy: "mask" }).events.map(stored);
    const withoutLunch = MAIN_PAYLOAD.events.filter((e) => e.iCalUId !== UID.lunch);
    const diff = diffImport(before, parseAutomate(withEvents(withoutLunch), MASK));
    expect(diff.gone.map((e) => e.uid)).toEqual([UID.lunch]);
  });

  test("maps Graph's extra showAs values to busy and joins categories", () => {
    const event = { ...MAIN_PAYLOAD.events[0], seriesMasterId: null, iCalUId: "x", showAs: "workingElsewhere", categories: [" A ", "", "B"] } as DiaryEvent;
    expect(parseAutomate(withEvents([event]), MASK).events[0]).toMatchObject({ showAs: "busy", categories: "A, B" });
  });

  test("the same occurrence twice is kept once, with a warning", () => {
    const [first] = MAIN_PAYLOAD.events;
    const result = parseAutomate(withEvents([first as DiaryEvent, { ...first, iCalUId: "dup" } as DiaryEvent]), MASK);
    expect(result.events).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });
});

describe("parseAutomate refuses a payload it can't key safely", () => {
  const refusal = (payload: DiaryPayload) => {
    const result = parseAutomate(payload, MASK);
    expect(result.events).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    return result.warnings[0];
  };

  test("when count differs from the number of events (cut off)", () => {
    expect(refusal({ ...MAIN_PAYLOAD, count: MAIN_PAYLOAD.count + 1 })).toMatch(/cut off/);
  });

  test("when an occurrence's series is missing from masters", () => {
    expect(refusal({ ...MAIN_PAYLOAD, masters: [] })).toMatch(/missing from masters/);
  });

  test("when an occurrence has no originalStart", () => {
    const event = occurrence(MASTER_ID.standUp, "10-12T07:30", "10-12T07:30", "10-12T07:45", { originalStart: null });
    expect(refusal(withEvents([event]))).toMatch(/no originalStart/);
  });

  test("when a timed event isn't in UTC", () => {
    const event = { ...MAIN_PAYLOAD.events[0], timeZone: "GMT Standard Time" } as DiaryEvent;
    expect(refusal(withEvents([event]))).toMatch(/Prefer: outlook.timezone="UTC"/);
  });

  test("when a time can't be read", () => {
    const event = { ...MAIN_PAYLOAD.events[0], start: "soon" } as DiaryEvent;
    expect(refusal(withEvents([event]))).toMatch(/not a valid time/);
  });
});
