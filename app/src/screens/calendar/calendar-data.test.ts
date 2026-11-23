import { expect, test } from "vitest";
import type { Event, Overlay } from "@/domain/selectors";
import { diaryData, latestImport, marksFor, openingDate, type ImportRow } from "./calendar-data";

const event = (over: Partial<Event> = {}): Event =>
  ({ id: "e1", _deleted: false, principal: "p1", start: "2026-11-24T14:00:00Z", end: "2026-11-24T15:00:00Z", subject: "Meeting", ...over }) as Event;
const overlay = (over: Partial<Overlay> = {}): Overlay => ({ id: "o1", _deleted: false, event: "e1", ...over }) as Overlay;

test("marks come in the order prep needed, flagged, moved, two at most", () => {
  expect(marksFor(event({ moves: 1 }), overlay({ prep: "needed", flagged: true }))).toEqual(["Prep needed", "Flagged"]);
  expect(marksFor(event({ moves: 2 }), overlay({ prep: "ready" }))).toEqual(["Moved"]);
  expect(marksFor(event(), undefined)).toEqual([]);
});

test("a masked event has no marks and a removed overlay counts for nothing", () => {
  expect(marksFor(event({ masked: true, moves: 1 }), overlay({ flagged: true }))).toEqual([]);
  expect(marksFor(event(), overlay({ flagged: true, _deleted: true }))).toEqual([]);
});

test("diary data leaves out gone events, other principals and events without times", () => {
  const data = diaryData([event(), event({ id: "e2", gone: true }), event({ id: "e3", principal: "p2" }), event({ id: "e4", start: undefined })], [], "p1");
  expect(data.events.map((e) => e.id)).toEqual(["e1"]);
  expect(data.faces.get("e1")).toEqual({ title: "Meeting", marks: [] });
});

test("the latest import is the principal's newest", () => {
  const rows = [
    { id: "i1", _deleted: false, principal: "p1", at: "2026-11-20T09:00:00Z" },
    { id: "i2", _deleted: false, principal: "p1", at: "2026-11-21T09:00:00Z" },
    { id: "i3", _deleted: false, principal: "p2", at: "2026-11-22T09:00:00Z" },
  ] as ImportRow[];
  expect(latestImport(rows, "p1")?.id).toBe("i2");
  expect(latestImport(rows, "p3")).toBeUndefined();
});

test("openingDate moves a Saturday or Sunday on to the coming Monday and keeps a weekday", () => {
  expect(openingDate("2026-11-28")).toBe("2026-11-30");
  expect(openingDate("2026-11-29")).toBe("2026-11-30");
  expect(openingDate("2026-11-27")).toBe("2026-11-27");
  expect(openingDate("2026-11-23")).toBe("2026-11-23");
});
