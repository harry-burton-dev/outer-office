// @vitest-environment node
// Find a time (OUT-85, brief 5.5 and B20).
import { describe, expect, test } from "vitest";
import { PLANTED_CLASHES, PLANTED_PRINCIPAL, plantedDays } from "../import/testing/synthetic-diaries";
import { clashes } from "./clashes";
import { dateIn, formatTime, weekdayOf } from "./dates";
import { findATime, type FindATimeInput } from "./find-a-time";
import { ev, ov, plantedDiary, ZONE } from "./testing/rows";

// Wednesday 25 November 2026 is GMT, so London and UTC read the same.
const at = (time: string, day = "2026-11-25") => `${day}T${time}:00Z`;
const meeting = ev("m", at("09:00"), at("10:00"));
const find = (over: Partial<FindATimeInput> = {}) =>
  findATime({ event: meeting, events: [meeting], overlays: [], zone: ZONE, dayStart: "08:00", dayEnd: "18:00", now: at("07:00"), ...over });
const starts = (slots: ReturnType<typeof findATime>) => slots.map((s) => `${dateIn(s.start, ZONE)} ${formatTime(s.start, ZONE)}`);

describe("findATime", () => {
  test("gives three slots of the same length on a 15-minute snap from the start of the working day, skipping where it already is", () => {
    const slots = find({ events: [meeting, ev("x", at("08:15"), at("08:30"))] });
    expect(starts(slots)).toEqual(["2026-11-25 08:30", "2026-11-25 08:45", "2026-11-25 09:15"]);
    for (const s of slots) expect(Date.parse(s.end) - Date.parse(s.start)).toBe(60 * 60_000);
  });

  test("busy and tentative engagements block a slot; free, quiet, another principal's and touching ends don't", () => {
    const events = [
      meeting,
      ev("busy", at("08:00"), at("10:00")), ev("tentative", at("10:00"), at("11:00"), { showAs: "tentative" }),
      ev("free", at("11:00"), at("12:00"), { showAs: "free" }), ev("quiet", at("11:00"), at("12:00")),
      ev("other", at("11:00"), at("12:00"), { principal: "q" }),
    ];
    expect(starts(find({ events, overlays: [ov("quiet", { quiet: true })] }))).toEqual(["2026-11-25 11:00", "2026-11-25 11:15", "2026-11-25 11:30"]);
    // Without the quiet flag, 11:00 to 12:00 is taken.
    expect(starts(find({ events }))[0]).toBe("2026-11-25 12:00");
  });

  test("a slot never runs past the end of the working day, and a full day moves on to the next", () => {
    const long = ev("m", at("09:00"), at("11:00"));
    const events = [long, ev("busy", at("08:00"), at("15:45"))];
    expect(starts(find({ event: long, events }))).toEqual(["2026-11-25 15:45", "2026-11-25 16:00", "2026-11-26 08:00"]);
  });

  test("proposals count as busy where they are proposed to go, not where Outlook has them", () => {
    const moved = ev("moved", at("08:00"), at("09:00"));
    const events = [meeting, moved];
    const proposed = [ev("moved", at("10:00"), at("11:00")), ev("proposal::new", at("08:00"), at("08:30"))];
    expect(starts(find({ events, proposed }))).toEqual(["2026-11-25 08:30", "2026-11-25 08:45", "2026-11-25 11:00"]);
  });

  test("weekdays only, unless the engagement is at a weekend", () => {
    const friday = ev("m", at("09:00", "2026-11-27"), at("10:00", "2026-11-27"));
    const busyFriday = ev("busy", at("08:00", "2026-11-27"), at("18:00", "2026-11-27"));
    expect(starts(find({ event: friday, events: [friday, busyFriday], now: at("07:00", "2026-11-27") }))[0]).toBe("2026-11-30 08:00");
    const saturday = ev("m", at("09:00", "2026-11-28"), at("10:00", "2026-11-28"));
    const busySaturday = ev("busy", at("08:00", "2026-11-28"), at("18:00", "2026-11-28"));
    expect(starts(find({ event: saturday, events: [saturday, busySaturday], now: at("07:00", "2026-11-28") }))[0]).toBe("2026-11-29 08:00");
  });

  test("searches the original day and nine more working days, and no further", () => {
    // Busy every day from Wednesday 25 November to Tuesday 8 December, the tenth working day: nothing.
    const busy = Array.from({ length: 14 }, (_, i) => {
      const day = new Date(Date.parse("2026-11-25T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
      return ev(`busy-${i}`, at("08:00", day), at("18:00", day));
    });
    expect(find({ events: [meeting, ...busy] })).toEqual([]);
    // Free the tenth working day and it is found.
    expect(starts(find({ events: [meeting, ...busy.filter((e) => !e.start?.startsWith("2026-12-08"))] }))[0]).toBe("2026-12-08 08:00");
  });

  test("no slot starts before now", () => {
    expect(starts(find({ now: at("13:05") }))).toEqual(["2026-11-25 13:15", "2026-11-25 13:30", "2026-11-25 13:45"]);
  });

  test("follows the office's working day, in its zone, through a clock change", () => {
    // Friday 23 October 2026 is BST: 08:00 London is 07:00 UTC, so 16:00 to 17:00 is 15:00 UTC. Monday 26 October is GMT.
    const bst = ev("m", "2026-10-23T08:00:00Z", "2026-10-23T09:00:00Z");
    const day = ev("busy", "2026-10-23T07:00:00Z", "2026-10-23T15:00:00Z");
    expect(find({ event: bst, events: [bst, day], dayEnd: "17:00", now: "2026-10-22T00:00:00Z" }).map((s) => s.start))
      .toEqual(["2026-10-23T15:00:00.000Z", "2026-10-26T08:00:00.000Z", "2026-10-26T08:15:00.000Z"]);
  });

  test("B20: for every planted clash, each slot passes the clash selector and sits inside the working day on a weekday", () => {
    const NOW = new Date("2026-11-23T09:00:00Z");
    const diary = plantedDiary(NOW);
    const { weekday } = plantedDays(NOW);
    const moving = PLANTED_CLASHES.filter(([, , severity]) => severity !== "away").map(([, second]) => diary.find((e) => e.subject === second && dateIn(e.start ?? "", ZONE) === weekday)!);
    expect(moving).toHaveLength(4);
    for (const event of moving) {
      const slots = findATime({ event, events: diary, overlays: [], zone: ZONE, dayStart: "08:00", dayEnd: "18:00", now: NOW.toISOString() });
      expect(slots).toHaveLength(3);
      for (const slot of slots) {
        const moved = diary.map((e) => (e.id === event.id ? { ...e, ...slot } : e));
        expect(clashes(moved, [], ZONE).filter((c) => c.first === event.id || c.second === event.id)).toEqual([]);
        expect(formatTime(slot.start, ZONE) >= "08:00" && formatTime(slot.end, ZONE) <= "18:00").toBe(true);
        expect([0, 6]).not.toContain(weekdayOf(dateIn(slot.start, ZONE)));
        expect(Number(formatTime(slot.start, ZONE).slice(3)) % 15).toBe(0);
        expect(event.principal).toBe(PLANTED_PRINCIPAL);
      }
    }
  });
});
