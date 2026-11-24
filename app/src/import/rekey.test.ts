// @vitest-environment node
import { describe, expect, test } from "vitest";
import { findRekeys } from "./rekey";
import type { ImportedEvent, StoredEvent } from "./types";

const at = (start: string, seriesId = "s1"): ImportedEvent => ({
  uid: seriesId, recurrenceId: start, start, end: start, allDay: false, subject: "Weekly", location: "", organizer: "", categories: "",
  showAs: "busy", masked: false, sourceModified: "", kind: "occurrence", seriesId,
});
const stored = (start: string, seriesId = "s1"): StoredEvent => ({ ...at(start, seriesId), id: start, principal: "p", gone: false, moves: 0 });
const weeks = ["2026-11-02T10:00:00.000Z", "2026-11-09T10:00:00.000Z", "2026-11-16T10:00:00.000Z"];
const anHourLater = (iso: string) => new Date(Date.parse(iso) + 3_600_000).toISOString();

describe("findRekeys", () => {
  test("old and new occurrences of one series pair by start, and equal counts near each other are unambiguous", () => {
    const [r] = findRekeys({ gone: weeks.map((w) => stored(w)), added: weeks.map((w) => at(anHourLater(w))) });
    expect(r?.ambiguous).toBe(false);
    expect(r?.pairs.map((p) => [p.from.start, p.to.start])).toEqual(weeks.map((w) => [w, anHourLater(w)]));
  });

  test("a pattern change that also drops an occurrence is ambiguous", () => {
    const [r] = findRekeys({ gone: weeks.map((w) => stored(w)), added: weeks.slice(0, 2).map((w) => at(anHourLater(w))) });
    expect(r?.ambiguous).toBe(true);
  });

  test("other series, and single events, are never paired", () => {
    expect(findRekeys({ gone: [stored(weeks[0]!, "s1")], added: [at(anHourLater(weeks[0]!), "s2")] })).toEqual([]);
    const single = { ...at(anHourLater(weeks[0]!)), recurrenceId: "", seriesId: "" };
    expect(findRekeys({ gone: [stored(weeks[0]!)], added: [single] })).toEqual([]);
  });
});
