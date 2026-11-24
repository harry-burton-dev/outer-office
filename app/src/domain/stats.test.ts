import { describe, expect, test } from "vitest";
import { monthRange, nextMonth, officeStats, totalOf, type StatsInput } from "./stats";

const row = <T>(fields: Record<string, unknown>) => ({ _deleted: false, _conflicts: {}, ...fields }) as T;
const TEMPLATE = row({ id: "t", name: "Brief", fields: JSON.stringify([{ id: "f", label: "Brief", type: "text", required: true }]) });
const ev = (id: string, start: string, more: Record<string, unknown> = {}) => row({ id, principal: "p1", start, end: start, ...more });
const card = (event: string, done: boolean) => row({ id: `c-${event}`, event, template: "t", values: JSON.stringify(done ? { f: "x" } : {}), order: 0 });

function input(over: Partial<StatsInput>): StatsInput {
  return { month: "2026-11", timezone: "Europe/London", now: "2026-11-23T12:00:00Z", events: [], overlays: [], cards: [], templates: [TEMPLATE] as never, log: [], ...over };
}

describe("stats", () => {
  test("months step across the year and follow the office's zone", () => {
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(nextMonth("2026-01", -1)).toBe("2025-12");
    expect(monthRange("2026-07", "Europe/London")).toEqual({ from: "2026-06-30T23:00:00.000Z", to: "2026-07-31T23:00:00.000Z" });
  });

  test("engagements count the month's events, not gone, archived or all-day ones", () => {
    const events = [
      ev("a", "2026-11-02T10:00:00Z"), ev("b", "2026-11-30T23:30:00Z"), ev("c", "2026-12-01T09:00:00Z"),
      ev("d", "2026-11-05T10:00:00Z", { gone: true }), ev("e", "2026-11-05T00:00:00Z", { allDay: true }),
      ev("f", "2026-11-06T10:00:00Z"), ev("g", "2026-11-06T10:00:00Z", { principal: "p2" }),
    ] as never[];
    const overlays = [row({ id: "o", event: "f", archived: "2026-11-07T00:00:00Z" })] as never[];
    const stats = officeStats(input({ events, overlays }));
    expect(stats.get("p1")?.engagements).toBe(2);
    expect(stats.get("p2")?.engagements).toBe(1);
    expect(totalOf(stats.values()).engagements).toBe(3);
  });

  test("prep is on time when every card was complete by the start, late when finished after", () => {
    const events = [
      ev("ready", "2026-11-10T10:00:00Z"), ev("late", "2026-11-11T10:00:00Z"), ev("open", "2026-11-12T10:00:00Z"),
      ev("bare", "2026-11-13T10:00:00Z"), ev("ahead", "2026-11-28T10:00:00Z"),
    ] as never[];
    const cards = [card("ready", true), card("late", true), card("open", false), card("ahead", true)] as never[];
    const log = [
      row({ id: "l1", kind: "card-ready", event: "ready", at: "2026-11-09T10:00:00Z" }),
      row({ id: "l2", kind: "card-ready", event: "late", at: "2026-11-11T12:00:00Z" }),
    ] as never[];
    expect(officeStats(input({ events, cards, log })).get("p1")).toMatchObject({ engagements: 5, withCards: 3, prepOnTime: 1, prepLate: 1 });
  });

  test("the month ends just before the next one starts, and prep done at the start is on time", () => {
    // November in London ends at 2026-12-01T00:00:00Z.
    const events = [ev("edge", "2026-12-01T00:00:00Z"), ev("start", "2026-11-20T10:00:00Z")] as never[];
    const cards = [card("start", true)] as never[];
    const log = [row({ id: "l", kind: "card-ready", event: "start", at: "2026-11-20T10:00:00Z" })] as never[];
    expect(officeStats(input({ events, cards, log })).get("p1")).toMatchObject({ engagements: 1, prepOnTime: 1, prepLate: 0 });
  });

  test("moves come from the month's log", () => {
    const log = [
      row({ id: "m1", area: "calendar", kind: "moved", principal: "p1", at: "2026-11-03T09:00:00Z" }),
      row({ id: "m2", area: "calendar", kind: "moved", principal: "p1", at: "2026-10-31T09:00:00Z" }),
      row({ id: "m3", area: "proposal", kind: "move", principal: "p1", at: "2026-11-03T09:00:00Z" }),
    ] as never[];
    expect(officeStats(input({ log })).get("p1")?.moves).toBe(1);
  });
});
