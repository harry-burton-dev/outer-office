// @vitest-environment node
import { describe, expect, test } from "vitest";
import { diffImport, marksMostGone } from "./diff";
import { parseIcs, type ParseResult } from "./parse-ics";
import { calendar, MAIN_EVENTS, MAIN_FIXTURE, MAIN_WINDOW, UID } from "./fixtures/outlook-ics";
import type { ImportedEvent, StoredEvent } from "./types";

const event = (overrides: Partial<ImportedEvent> = {}): ImportedEvent => ({
  uid: "u1", recurrenceId: "", start: "2026-10-20T09:00:00.000Z", end: "2026-10-20T10:00:00.000Z", allDay: false,
  subject: "Weekly review", location: "Room 1", organizer: "Alex Example", categories: "", showAs: "busy", masked: false,
  sourceModified: "2026-10-01T00:00:00.000Z", ...overrides,
});
const stored = (overrides: Partial<StoredEvent> = {}): StoredEvent => ({
  ...event(), id: `id-${overrides.uid ?? "u1"}`, principal: "p1", gone: false, moves: 0, ...overrides,
});
const parsed = (events: readonly ImportedEvent[], overrides: Partial<ParseResult> = {}): ParseResult => ({
  events, rangeStart: "2026-10-12T00:00:00.000Z", rangeEnd: "2026-11-09T00:00:00.000Z",
  droppedPrivate: 0, maskedPrivate: 0, warnings: [], ...overrides,
});
const apply = (events: readonly ImportedEvent[]): StoredEvent[] =>
  events.map((e, i) => ({ ...e, id: `id-${i}`, principal: "p1", gone: false, moves: 0 }));

describe("diffImport", () => {
  test("an event in the file but not stored is added", () => {
    const diff = diffImport([], parsed([event()]));
    expect(diff.added).toEqual([event()]);
    expect(diff.unchanged).toBe(0);
  });

  test("a stored event with a different field is changed, listing the fields", () => {
    const after = event({ subject: "Weekly review (moved room)", location: "Room 2", sourceModified: "2026-10-05T00:00:00.000Z" });
    const diff = diffImport([stored()], parsed([after]));
    expect(diff.changed).toEqual([{ before: stored(), after, fields: ["subject", "location"], moved: false }]);
  });

  test("a changed attendee response is a change; a field the source does not carry is not", () => {
    const before = stored({ requiredAttendees: "Blake · no response", importance: "high" });
    const declined = event({ requiredAttendees: "Blake · declined", importance: "high" });
    expect(diffImport([before], parsed([declined])).changed[0]?.fields).toEqual(["requiredAttendees"]);
    expect(diffImport([stored({ importance: "" })], parsed([event()])).changed).toEqual([]);
  });

  test("the same instant written another way is not a change", () => {
    const after = event({ start: "2026-10-20T09:00:00Z", end: "2026-10-20T10:00:00+00:00" });
    const diff = diffImport([stored()], parsed([after]));
    expect(diff.changed).toEqual([]);
    expect(diff.unchanged).toBe(1);
  });

  test("a newer modified time with nothing else changed is not a change", () => {
    const diff = diffImport([stored()], parsed([event({ sourceModified: "2026-10-05T00:00:00.000Z" })]));
    expect(diff.changed).toEqual([]);
    expect(diff.unchanged).toBe(1);
  });

  test("a changed start marks the change as moved", () => {
    const after = event({ start: "2026-10-21T09:00:00.000Z", end: "2026-10-21T10:00:00.000Z" });
    const [change] = diffImport([stored()], parsed([after])).changed;
    expect(change).toMatchObject({ fields: ["start", "end"], moved: true });
  });

  test("a file version older than the stored one is skipped, not changed", () => {
    const after = event({ subject: "Stale", sourceModified: "2026-09-01T00:00:00.000Z" });
    const diff = diffImport([stored()], parsed([after]));
    expect(diff.changed).toEqual([]);
    expect(diff.skippedOlder).toBe(1);
  });

  test("the older rule needs both sourceModified values", () => {
    const after = event({ subject: "New", sourceModified: "" });
    expect(diffImport([stored()], parsed([after])).changed).toHaveLength(1);
    expect(diffImport([stored({ sourceModified: "" })], parsed([event({ subject: "New" })])).changed).toHaveLength(1);
  });

  test("a stored gone event that is back in the file is returned, not changed", () => {
    const diff = diffImport([stored({ gone: true })], parsed([event()]));
    expect(diff.returned).toEqual([{ before: stored({ gone: true }), after: event(), fields: [], moved: false }]);
    expect(diff.changed).toEqual([]);
    expect(diff.unchanged).toBe(0);
  });

  test("a stored event inside the range and missing from the file is gone", () => {
    const diff = diffImport([stored()], parsed([]));
    expect(diff.gone).toEqual([stored()]);
  });

  test("range edges are inclusive; stored events outside the range are never gone", () => {
    const atStart = stored({ uid: "a", start: "2026-10-12T00:00:00.000Z" });
    const atEnd = stored({ uid: "b", start: "2026-11-09T00:00:00.000Z" });
    const before = stored({ uid: "c", start: "2026-10-11T23:59:59.000Z" });
    const after = stored({ uid: "d", start: "2026-11-09T00:00:01.000Z" });
    const diff = diffImport([atStart, atEnd, before, after], parsed([]));
    expect(diff.gone.map((e) => e.uid)).toEqual(["a", "b"]);
  });

  test("a stored event already gone and still missing is not gone again", () => {
    expect(diffImport([stored({ gone: true })], parsed([])).gone).toEqual([]);
  });

  test("matches by uid and recurrenceId", () => {
    const instance = event({ recurrenceId: "2026-10-20T09:00:00.000Z" });
    const diff = diffImport([stored()], parsed([instance]));
    expect(diff.added).toEqual([instance]);
    expect(diff.gone).toEqual([stored()]);
  });

  test("carries the range and private counts from the parse result", () => {
    const diff = diffImport([], parsed([], { droppedPrivate: 2, maskedPrivate: 3 }));
    expect(diff).toMatchObject({ rangeStart: "2026-10-12T00:00:00.000Z", rangeEnd: "2026-11-09T00:00:00.000Z", droppedPrivate: 2, maskedPrivate: 3 });
  });

  test("does not mutate its inputs", () => {
    const storedEvents = Object.freeze([Object.freeze(stored())]);
    const result = Object.freeze(parsed(Object.freeze([Object.freeze(event({ subject: "x" }))])));
    expect(() => diffImport(storedEvents, result)).not.toThrow();
    expect(storedEvents[0]?.subject).toBe("Weekly review");
  });

  test("the main fixture against its own applied result is all unchanged", () => {
    const result = parseIcs(MAIN_FIXTURE, { ...MAIN_WINDOW, privatePolicy: "mask" });
    const diff = diffImport(apply(result.events), result);
    expect(diff).toMatchObject({ added: [], changed: [], gone: [], returned: [], skippedOlder: 0, unchanged: 23 });
  });

  test("a first import of the main fixture adds every occurrence", () => {
    const result = parseIcs(MAIN_FIXTURE, { ...MAIN_WINDOW, privatePolicy: "drop" });
    const diff = diffImport([], result);
    expect(diff.added).toHaveLength(22);
    expect(diff.droppedPrivate).toBe(1);
  });

  test("an event deleted at either end of the export is gone", () => {
    const options = { ...MAIN_WINDOW, privatePolicy: "mask" } as const;
    const storedEvents = apply(parseIcs(MAIN_FIXTURE, options).events);
    const without = (uid: string) => calendar(MAIN_EVENTS.filter((lines) => !lines.includes(`UID:${uid}`)));
    const lastGone = diffImport(storedEvents, parseIcs(without(UID.workshop), options));
    expect(lastGone.gone.map((e) => e.uid)).toEqual([UID.workshop]);
    const firstGone = diffImport(storedEvents, parseIcs(without(UID.standUp), options));
    expect(firstGone.gone).toHaveLength(8);
    expect(firstGone.gone.every((e) => e.uid === UID.standUp)).toBe(true);
  });
});

describe("marksMostGone", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => stored({ uid: `u${i}`, id: `id-${i}` }));

  test("an empty file against a full diary needs confirming", () => {
    expect(marksMostGone(diffImport(many(15), parsed([])))).toBe(true);
  });

  test("half or fewer gone does not", () => {
    const storedEvents = many(6);
    const kept = storedEvents.slice(0, 3).map(({ id: _id, principal: _p, gone: _g, moves: _m, ...e }) => e);
    expect(marksMostGone(diffImport(storedEvents, parsed(kept)))).toBe(false);
  });

  test("events skipped as older still count as in the diary", () => {
    const storedEvents = many(6);
    const stale = storedEvents.slice(0, 3).map(({ id: _id, principal: _p, gone: _g, moves: _m, ...e }) => ({ ...e, subject: "Stale", sourceModified: "2026-09-01T00:00:00.000Z" }));
    const diff = diffImport(storedEvents, parsed(stale));
    expect(diff.skippedOlder).toBe(3);
    expect(marksMostGone(diff)).toBe(false);
  });

  test("fewer than three gone never does", () => {
    expect(marksMostGone(diffImport(many(2), parsed([])))).toBe(false);
  });
});
