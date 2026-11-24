// @vitest-environment node
import { describe, expect, test } from "vitest";
import { parseIcs, type ParseOptions } from "./parse-ics";
import { calendar, MAIN_FIXTURE, MAIN_WINDOW, UID, WORKSHOP_SUBJECT } from "./fixtures/outlook-ics";

const MASK: ParseOptions = { ...MAIN_WINDOW, privatePolicy: "mask" };
const DROP: ParseOptions = { ...MAIN_WINDOW, privatePolicy: "drop" };

// Expected occurrences, worked out by hand from the fixture's own rules.
// Europe/London is BST (UTC+1) until 01:00 UTC on Sunday 25 Oct 2026, then GMT (UTC+0).
// 12 Oct 2026 is a Monday (25 Oct is the last Sunday of October; 25 - 13 = 12).
//
// Weekly review: Mondays 09:00-10:00 local, COUNT=8 from 5 Oct = 5, 12, 19, 26 Oct, 2, 9, 16, 23 Nov.
//   Window is [11 Oct 23:00Z, 9 Nov 00:00Z): 5 Oct is before it, 9 Nov 09:00Z and later are after it.
//   Kept: 12, 19 Oct (BST: 08:00Z) and 26 Oct, 2 Nov (GMT: 09:00Z)            -> 4
// Daily stand-up: weekdays 08:30-08:45 BST (07:30Z) 12-23 Oct = 10, minus EXDATE 14 Oct,
//   minus cancelled instance 21 Oct                                             -> 8
// Project sync: Thursdays 14:00-15:00, COUNT=4 = 15, 22, 29 Oct, 5 Nov. 22 Oct moves to
//   Fri 23 Oct 11:00-12:00 BST (10:00Z) but keeps recurrenceId 22 Oct 13:00Z.
//   15 Oct BST 13:00Z; 29 Oct and 5 Nov GMT 14:00Z                               -> 4
// Office closed: all day Fri 16 Oct, local midnight BST = 15 Oct 23:00Z to 16 Oct 23:00Z -> 1
// Sector conference: all day 23-26 Oct (DTEND 27 Oct), 22 Oct 23:00Z (BST) to 27 Oct 00:00Z (GMT) -> 1
// Personal appointment: CLASS:PRIVATE, 3 Nov 10:00 GMT = 10:00Z; kept only with "mask"  -> 1
// Supplier call: STATUS:CANCELLED                                               -> 0
// Call with remote team: UTC 28 Oct 16:00Z-16:30Z                               -> 1
// Team lunch: floating 13 Oct 12:00-13:00 read in Europe/London (BST) = 11:00Z-12:00Z -> 1
// Submit monthly report: 4 Nov 17:00 GMT, no DTEND so end = start = 17:00Z       -> 1
// Workshop: 6 Nov 13:00-16:00 GMT = 13:00Z-16:00Z (folded SUMMARY)              -> 1
// Earlier meeting (1 Oct) and Later meeting (20 Nov) are outside the window      -> 0
// Total with "mask": 4 + 8 + 4 + 1 + 1 + 1 + 1 + 1 + 1 + 1 = 23. With "drop": 22.
const S = (date: string): string => `2026-${date}:00.000Z`;
type Row = readonly [uid: string, recurrenceId: string, start: string, end: string];
const EXPECTED: readonly Row[] = [
  [UID.standUp, S("10-12T07:30"), S("10-12T07:30"), S("10-12T07:45")],
  [UID.weeklyReview, S("10-12T08:00"), S("10-12T08:00"), S("10-12T09:00")],
  [UID.standUp, S("10-13T07:30"), S("10-13T07:30"), S("10-13T07:45")],
  [UID.lunch, "", S("10-13T11:00"), S("10-13T12:00")],
  [UID.standUp, S("10-15T07:30"), S("10-15T07:30"), S("10-15T07:45")],
  [UID.projectSync, S("10-15T13:00"), S("10-15T13:00"), S("10-15T14:00")],
  [UID.officeClosed, "", S("10-15T23:00"), S("10-16T23:00")],
  [UID.standUp, S("10-16T07:30"), S("10-16T07:30"), S("10-16T07:45")],
  [UID.standUp, S("10-19T07:30"), S("10-19T07:30"), S("10-19T07:45")],
  [UID.weeklyReview, S("10-19T08:00"), S("10-19T08:00"), S("10-19T09:00")],
  [UID.standUp, S("10-20T07:30"), S("10-20T07:30"), S("10-20T07:45")],
  [UID.standUp, S("10-22T07:30"), S("10-22T07:30"), S("10-22T07:45")],
  [UID.conference, "", S("10-22T23:00"), S("10-27T00:00")],
  [UID.standUp, S("10-23T07:30"), S("10-23T07:30"), S("10-23T07:45")],
  [UID.projectSync, S("10-22T13:00"), S("10-23T10:00"), S("10-23T11:00")],
  [UID.weeklyReview, S("10-26T09:00"), S("10-26T09:00"), S("10-26T10:00")],
  [UID.remoteTeam, "", S("10-28T16:00"), S("10-28T16:30")],
  [UID.projectSync, S("10-29T14:00"), S("10-29T14:00"), S("10-29T15:00")],
  [UID.weeklyReview, S("11-02T09:00"), S("11-02T09:00"), S("11-02T10:00")],
  [UID.personal, "", S("11-03T10:00"), S("11-03T11:00")],
  [UID.reminder, "", S("11-04T17:00"), S("11-04T17:00")],
  [UID.projectSync, S("11-05T14:00"), S("11-05T14:00"), S("11-05T15:00")],
  [UID.workshop, "", S("11-06T13:00"), S("11-06T16:00")],
];

const rows = (options: ParseOptions): Row[] =>
  parseIcs(MAIN_FIXTURE, options).events.map((e) => [e.uid, e.recurrenceId, e.start, e.end] as const);
const find = (uid: string, options: ParseOptions = MASK) => parseIcs(MAIN_FIXTURE, options).events.filter((e) => e.uid === uid);

describe("parseIcs on the main Outlook fixture", () => {
  test("the fixture is Outlook-shaped: CRLF line endings and at least one folded line", () => {
    expect(MAIN_FIXTURE).toContain("PRODID:-//Microsoft Corporation//Outlook");
    expect(MAIN_FIXTURE.split("\r\n").length).toBeGreaterThan(100);
    expect(MAIN_FIXTURE.replace(/\r\n/g, "")).not.toContain("\n");
    expect(MAIN_FIXTURE).toMatch(/\r\n [^\r\n]/);
  });

  test("gives exactly the hand-computed 23 occurrences, sorted by start, with every time", () => {
    expect(rows(MASK)).toEqual(EXPECTED);
  });

  test("drop policy leaves the private event out and counts it", () => {
    const result = parseIcs(MAIN_FIXTURE, DROP);
    expect(result.events).toHaveLength(22);
    expect(result.droppedPrivate).toBe(1);
    expect(result.maskedPrivate).toBe(0);
    expect(result.events.some((e) => e.uid === UID.personal)).toBe(false);
  });

  test("mask policy keeps times and showAs but hides the details", () => {
    const result = parseIcs(MAIN_FIXTURE, MASK);
    expect(result.maskedPrivate).toBe(1);
    expect(result.droppedPrivate).toBe(0);
    const [masked] = find(UID.personal);
    expect(masked).toMatchObject({ subject: "Private, busy", location: "", organizer: "", categories: "", masked: true, showAs: "busy" });
  });

  test("range is the file's declared X-CALSTART to X-CALEND, not its first and last events", () => {
    const result = parseIcs(MAIN_FIXTURE, MASK);
    expect(result.rangeStart).toBe(S("10-12T00:00"));
    expect(result.rangeEnd).toBe(S("11-09T00:00"));
    expect(result.warnings).toEqual([]);
  });

  test("with no declared range, the range runs from the earliest kept start to the latest kept end", () => {
    const result = parseIcs(MAIN_FIXTURE.replace(/X-CAL(START|END):[^\r\n]*\r\n/g, ""), MASK);
    expect(result.rangeStart).toBe(S("10-12T07:30"));
    expect(result.rangeEnd).toBe(S("11-06T16:00"));
  });

  test("the declared range is widened to take in an occurrence outside it", () => {
    const result = parseIcs(MAIN_FIXTURE.replace("X-CALEND:20261109T000000Z", "X-CALEND:20261101T000000Z"), MASK);
    expect(result.rangeEnd).toBe(S("11-06T16:00"));
  });

  test("a file with no events keeps its declared range", () => {
    const result = parseIcs(calendar([]), MASK);
    expect(result.events).toEqual([]);
    expect(result.rangeStart).toBe(S("10-12T00:00"));
    expect(result.rangeEnd).toBe(S("11-09T00:00"));
  });

  test("weekly 09:00 London meeting stays at 09:00 local across the 25 October clock change", () => {
    expect(find(UID.weeklyReview).map((e) => e.start)).toEqual([S("10-12T08:00"), S("10-19T08:00"), S("10-26T09:00"), S("11-02T09:00")]);
  });

  test("moved instance keeps its original start as recurrenceId and its own details", () => {
    const moved = find(UID.projectSync).find((e) => e.recurrenceId === S("10-22T13:00"));
    expect(moved).toMatchObject({ start: S("10-23T10:00"), end: S("10-23T11:00"), sourceModified: S("10-10T09:00") });
  });

  test("EXDATE and a cancelled instance are both left out", () => {
    const ids = find(UID.standUp).map((e) => e.recurrenceId);
    expect(ids).not.toContain(S("10-14T07:30"));
    expect(ids).not.toContain(S("10-21T07:30"));
  });

  test("cancelled single event is left out", () => {
    expect(find(UID.supplierCall)).toEqual([]);
  });

  test("all-day events are flagged and run local midnight to local midnight", () => {
    expect(find(UID.officeClosed)[0]).toMatchObject({ allDay: true, showAs: "free" });
    expect(find(UID.conference)[0]).toMatchObject({ allDay: true, showAs: "oof", location: "Conference centre" });
    expect(find(UID.lunch)[0]?.allDay).toBe(false);
  });

  test("reads fields: folded subject, organizer CN or address, categories, showAs, sourceModified", () => {
    expect(find(UID.workshop)[0]).toMatchObject({
      subject: WORKSHOP_SUBJECT, organizer: "organiser@example.invalid", showAs: "tentative",
      location: "Board room", masked: false, sourceModified: S("10-20T08:30"),
    });
    expect(find(UID.weeklyReview)[0]).toMatchObject({ organizer: "Alex Example", sourceModified: S("09-15T10:00") });
    expect(find(UID.projectSync)[0]?.categories).toBe("Projects, Internal");
    expect(find(UID.reminder)[0]?.showAs).toBe("free");
  });

  test("parsing the same file twice gives identical output", () => {
    expect(parseIcs(MAIN_FIXTURE, MASK)).toEqual(parseIcs(MAIN_FIXTURE, MASK));
  });
});

describe("window edges", () => {
  test("a window starting mid-series drops earlier occurrences", () => {
    const result = parseIcs(MAIN_FIXTURE, { ...MASK, windowStart: S("10-20T00:00") });
    expect(result.events.filter((e) => e.uid === UID.weeklyReview).map((e) => e.start)).toEqual([S("10-26T09:00"), S("11-02T09:00")]);
  });

  test("a window ending mid-series drops later occurrences", () => {
    const result = parseIcs(MAIN_FIXTURE, { ...MASK, windowEnd: S("10-20T00:00") });
    expect(result.events.filter((e) => e.uid === UID.weeklyReview).map((e) => e.start)).toEqual([S("10-12T08:00"), S("10-19T08:00")]);
  });

  test("an empty window gives no events and the window as the range", () => {
    const result = parseIcs(MAIN_FIXTURE, { ...MASK, windowStart: S("12-01T00:00"), windowEnd: S("12-31T00:00") });
    expect(result.events).toEqual([]);
    expect(result.rangeStart).toBe(S("12-01T00:00"));
    expect(result.rangeEnd).toBe(S("12-31T00:00"));
  });
});
