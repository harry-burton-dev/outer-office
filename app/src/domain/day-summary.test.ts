// @vitest-environment node
import { describe, expect, test } from "vitest";
import { PLANTED_PRINCIPAL, PLANTED_SUMMARY, plantedDays } from "../import/testing/synthetic-diaries";
import { clashes } from "./clashes";
import { daySummary, hasWarnings, type DaySummaryInput } from "./day-summary";
import type { Event, Overlay } from "./selectors";
import { ev, ov, plantedDiary, ZONE } from "./testing/rows";

const DAY = "2026-11-25";
const at = (time: string) => `${DAY}T${time}:00Z`;
const summary = (events: Event[], overlays: Overlay[] = [], extra: Partial<DaySummaryInput> = {}) =>
  daySummary({ date: DAY, zone: ZONE, principal: "p", events, overlays, clashes: clashes(events, overlays, ZONE), dayStart: "08:00", dayEnd: "18:00", ...extra });

describe("day summary", () => {
  test("an ordinary day says nothing", () => {
    const s = summary([ev("a", at("09:00"), at("10:00"), { location: "Room 1" }), ev("b", at("11:00"), at("12:00"), { location: "Room 2" })]);
    expect(hasWarnings(s)).toBe(false);
  });

  test("counts clashes by severity on the day they begin, leaving quiet ones out", () => {
    const events = [ev("a", at("09:00"), at("10:00")), ev("b", at("09:30"), at("10:30")), ev("c", at("09:45"), at("10:15"), { showAs: "tentative" })];
    expect(summary(events).clashes).toEqual({ hard: 1, soft: 2, away: 0 });
    expect(summary(events, [ov("c", { quiet: true })]).clashes).toEqual({ hard: 1, soft: 0, away: 0 });
    expect(summary(events, [], { date: "2026-11-26" }).clashes).toEqual({ hard: 0, soft: 0, away: 0 });
  });

  test("a place change is in-person to another place with less than the limit between", () => {
    const events = [
      ev("a", at("09:00"), at("10:00"), { location: "Room 1" }), ev("b", at("10:20"), at("11:00"), { location: "Elsewhere" }),
      ev("c", at("11:30"), at("12:00"), { location: "Microsoft Teams Meeting" }), ev("d", at("12:00"), at("12:30"), { location: "elsewhere " }),
      ev("e", at("13:00"), at("14:00"), { location: "Far away" }),
    ];
    // a→b (20 min), d→e (30 min, not less than 30). b→d is the same place; the call is online.
    expect(summary(events).placeChanges).toBe(1);
    expect(summary(events, [], { placeChangeMinutes: 31 }).placeChanges).toBe(2);
    expect(summary(events, [], { placeChangeMinutes: 20 }).placeChanges).toBe(0);
  });

  test("a place change is measured from the engagement that ends last, and a linked child is part of its parent's place", () => {
    const events = [
      ev("visit", at("14:00"), at("17:00"), { location: "Works" }), ev("speech", at("15:00"), at("15:30"), { location: "Works hall" }),
      ev("reception", at("17:00"), at("18:00"), { location: "Hall" }),
    ];
    expect(summary(events, [ov("speech", { parent: "visit" })]).placeChanges).toBe(1);
    // Unlinked, the speech is a change of place too; the reception is still measured from the visit's end.
    expect(summary(events).placeChanges).toBe(2);
  });

  test("a masked item has no place", () => {
    const events = [ev("a", at("09:00"), at("10:00"), { location: "Room 1" }), ev("b", at("10:00"), at("11:00"), { location: "Clinic", masked: true })];
    expect(summary(events).placeChanges).toBe(0);
  });

  test("the longest run without a 15-minute break, only when longer than the limit", () => {
    const events = [
      ev("a", at("09:00"), at("11:00")), ev("b", at("11:14"), at("12:00")), ev("c", at("11:30"), at("13:01")),
      ev("d", at("13:16"), at("14:00")), ev("free", at("13:00"), at("13:16"), { showAs: "free" }),
    ];
    // 09:00 to 13:01: the 14-minute gap doesn't break it; the 15-minute one does, and free time isn't busy.
    expect(summary(events).longRun).toBe(241);
    expect(summary(events, [], { longRunHours: 4.5 }).longRun).toBe(0);
    expect(summary(events.slice(0, 1)).longRun).toBe(0);
  });

  test("a run of exactly the limit is not flagged", () => {
    expect(summary([ev("a", at("09:00"), at("13:00"))]).longRun).toBe(0);
  });

  test("starts before and ends after the working day, in the office's zone", () => {
    // 2026-07-01: London is an hour ahead of UTC.
    const day = "2026-07-01";
    const events = [ev("a", `${day}T06:30:00Z`, `${day}T07:30:00Z`), ev("b", `${day}T16:00:00Z`, `${day}T17:15:00Z`), ev("c", `${day}T16:00:00Z`, `${day}T16:30:00Z`)];
    expect(summary(events, [], { date: day })).toMatchObject({ early: "07:30", late: "18:15" });
    expect(summary([ev("a", `${day}T07:00:00Z`, `${day}T17:00:00Z`)], [], { date: day })).toMatchObject({ early: "", late: "" });
  });

  test("an engagement over midnight ends after the day", () => {
    expect(summary([ev("a", at("17:00"), "2026-11-26T00:30:00Z")]).late).toBe("00:30");
  });

  test("gone, archived, all-day, free and other principals' engagements don't count", () => {
    const events = [
      ev("gone", at("06:00"), at("07:00"), { gone: true }), ev("arch", at("06:00"), at("07:00")),
      ev("free", at("06:00"), at("07:00"), { showAs: "free" }), ev("other", at("06:00"), at("07:00"), { principal: "q" }),
      ev("allday", at("00:00"), "2026-11-26T00:00:00Z", { allDay: true }),
    ];
    expect(hasWarnings(summary(events, [ov("arch", { archived: "x" })]))).toBe(false);
  });

  test("counts linked engagements moved outside their parent", () => {
    const events = [ev("visit", at("14:00"), at("16:00")), ev("speech", at("16:30"), at("17:00"))];
    expect(summary(events, [ov("speech", { parent: "visit" })]).linkedOutside).toBe(1);
    expect(summary(events, [ov("speech", { parent: "visit" })], { date: "2026-11-26" }).linkedOutside).toBe(0);
  });

  test("B14: the planted day's counts match each planted condition", () => {
    const NOW = new Date("2026-11-23T12:00:00Z");
    const diary = plantedDiary(NOW);
    const s = daySummary({
      date: plantedDays(NOW).weekday, zone: ZONE, principal: PLANTED_PRINCIPAL, events: diary, overlays: [],
      clashes: clashes(diary, [], ZONE), dayStart: "08:00", dayEnd: "18:00",
    });
    expect(s).toEqual(PLANTED_SUMMARY);
    const away = daySummary({
      date: plantedDays(NOW).weekend, zone: ZONE, principal: PLANTED_PRINCIPAL, events: diary, overlays: [],
      clashes: clashes(diary, [], ZONE), dayStart: "08:00", dayEnd: "18:00",
    });
    expect(away.clashes).toEqual({ hard: 0, soft: 0, away: 1 });
  });
});
