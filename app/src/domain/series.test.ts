import { describe, expect, test } from "vitest";
import { healthText, isEnding, seriesFor } from "./series";
import type { Event } from "./selectors";

const NOW = "2026-11-24T12:00:00Z";
const row = (fields: Record<string, unknown>) => ({ _deleted: false, _conflicts: {}, ...fields }) as unknown as Event;
const iso = (day: string, time = "09:00") => `${day}T${time}:00.000Z`;
const hourLater = (start: string) => new Date(Date.parse(start) + 3_600_000).toISOString();

/** An occurrence of series `uid` whose original slot is `slot`, by default held there for an hour. */
function occ(uid: string, slot: string, more: Record<string, unknown> = {}): Event {
  const start = (more.start as string | undefined) ?? slot;
  return row({ id: `${uid}@${slot}`, principal: "p1", uid, recurrenceId: slot, start, end: hourLater(start), subject: uid, moves: 0, gone: false, ...more });
}

/** Weekly slots on Mondays from 2 Nov 2026. */
const weekly = (count: number, first = "2026-11-02") =>
  Array.from({ length: count }, (_, i) => new Date(Date.parse(iso(first)) + i * 7 * 86_400_000).toISOString());

describe("series", () => {
  test("only events with a recurrence id, of the chosen principal, make a series", () => {
    const events = [
      ...weekly(3).map((s) => occ("s1", s)),
      row({ id: "single", principal: "p1", uid: "single", recurrenceId: "", start: iso("2026-11-25") }),
      occ("other", iso("2026-11-25"), { principal: "p2" }),
      occ("deleted", iso("2026-11-25"), { _deleted: true }),
    ];
    expect(seriesFor(events, "p1", NOW).map((s) => s.key)).toEqual(["s1"]);
  });

  test("counts, exceptions, next and end come from the occurrences", () => {
    const slots = weekly(8);
    const events = slots.map((s, i) =>
      i === 1 ? occ("s1", s, { start: iso("2026-11-10", "11:00") })
      : i === 2 ? occ("s1", s, { gone: true })
      : i === 4 ? occ("s1", s, { moves: 1 })
      : occ("s1", s));
    const [series] = seriesFor(events, "p1", NOW);
    expect(series?.occurrences.map((o) => o.state)).toEqual(["as-planned", "moved", "cancelled", "as-planned", "moved", "as-planned", "as-planned", "as-planned"]);
    expect(series?.count).toBe(7);
    expect(series?.exceptions).toBe(3);
    expect(series?.next?.start).toBe(slots[4]);
    expect(series?.end).toBe(slots[7]);
  });

  test("gone occurrences with nothing after them cut the series short and are not exceptions", () => {
    const slots = weekly(6);
    const events = slots.map((s, i) => occ("s1", s, { gone: i >= 4 }));
    const [series] = seriesFor(events, "p1", "2026-12-31T00:00:00Z");
    expect(series?.occurrences.slice(-2).map((o) => o.state)).toEqual(["cut", "cut"]);
    expect(series?.exceptions).toBe(0);
    expect(series?.end).toBe(slots[3]);
    expect(series?.next).toBeUndefined();
    expect(series?.health.cutShort).toBe(true);
    expect(healthText(series!.health)).toBe("cut short");
  });

  test("health looks at the last 8 occurrences that have passed", () => {
    const slots = weekly(12, "2026-09-07");
    // All 12 have passed; the last 8 are slots 4 to 11, which hold three of the four moves.
    const movedAt = new Set([0, 6, 7, 9]);
    const events = slots.map((s, i) => occ("s1", s, movedAt.has(i) ? { moves: 1 } : i === 10 ? { gone: true } : {}));
    const [series] = seriesFor(events, "p1", NOW);
    expect(series?.health).toEqual({ recent: 8, moved: 3, cancelled: 1, cutShort: false });
    expect(healthText(series!.health)).toBe("moved 3 of the last 8, cancelled 1 of the last 8");
  });

  test("a weekly hour takes about four and a third hours a month", () => {
    const [series] = seriesFor(weekly(8).map((s) => occ("s1", s)), "p1", NOW);
    expect(series?.hoursPerMonth).toBeCloseTo(4.35, 1);
    const [one] = seriesFor([occ("s2", iso("2026-11-30"))], "p1", NOW);
    expect(one?.hoursPerMonth).toBe(1);
  });

  test("series still to come are listed first, by next occurrence, then ended ones by last", () => {
    const events = [
      occ("later", iso("2026-12-03")), occ("sooner", iso("2026-11-26")),
      occ("old", iso("2026-10-01")), occ("older", iso("2026-09-01")),
    ];
    expect(seriesFor(events, "p1", NOW).map((s) => s.key)).toEqual(["sooner", "later", "old", "older"]);
  });

  test("a series is ending within 4 weeks of its last occurrence, and not once that has passed", () => {
    const [series] = seriesFor(weekly(8).map((s) => occ("s1", s)), "p1", NOW); // last: 21 Dec
    expect(isEnding(series!, "2026-11-23T08:59:59Z")).toBe(false);
    expect(isEnding(series!, "2026-11-23T09:00:00Z")).toBe(true);
    expect(isEnding(series!, "2026-12-21T09:00:00Z")).toBe(false);
  });
});
