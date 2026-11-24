// @vitest-environment node
import { describe, expect, test } from "vitest";
import { PLANTED_CLASHES, plantedDays } from "../import/testing/synthetic-diaries";
import { childrenOf, clashes, clashesByEvent, linkedOutside, suggestedParent } from "./clashes";
import { dateIn } from "./dates";
import { ev, ov, plantedDiary, ZONE } from "./testing/rows";

const at = (time: string, day = "2026-11-25") => `${day}T${time}:00Z`;
const pairs = (found: ReturnType<typeof clashes>) => found.map((c) => [c.first, c.second, c.severity]);

describe("clashes", () => {
  test("busy with busy is hard, anything tentative is soft, free never clashes", () => {
    const events = [
      ev("a", at("09:00"), at("10:00")), ev("b", at("09:30"), at("10:30")),
      ev("c", at("11:00"), at("12:00"), { showAs: "tentative" }), ev("d", at("11:30"), at("12:30"), { showAs: "tentative" }),
      ev("e", at("13:00"), at("14:00"), { showAs: "tentative" }), ev("f", at("13:30"), at("13:45"), { showAs: "oof" }),
      ev("g", at("15:00"), at("16:00")), ev("h", at("15:00"), at("16:00"), { showAs: "free" }),
    ];
    expect(pairs(clashes(events, [], ZONE))).toEqual([["a", "b", "hard"], ["c", "d", "soft"], ["e", "f", "soft"]]);
  });

  test("touching ends don't clash; one inside another does; the clash begins at the later start", () => {
    const found = clashes([ev("a", at("09:00"), at("10:00")), ev("b", at("10:00"), at("11:00")), ev("c", at("10:15"), at("10:30"))], [], ZONE);
    expect(found).toEqual([{ first: "b", second: "c", severity: "hard", at: at("10:15") }]);
  });

  test("only the same principal's engagements clash", () => {
    expect(clashes([ev("a", at("09:00"), at("10:00")), ev("b", at("09:00"), at("10:00"), { principal: "q" })], [], ZONE)).toEqual([]);
  });

  test("gone, archived, removed and quiet engagements never clash", () => {
    const events = [
      ev("a", at("09:00"), at("10:00")), ev("gone", at("09:00"), at("10:00"), { gone: true }),
      ev("removed", at("09:00"), at("10:00"), { _deleted: true }), ev("archived", at("09:00"), at("10:00")), ev("quiet", at("09:00"), at("10:00")),
    ];
    const overlays = [ov("archived", { archived: "2026-11-20T09:00:00Z" }), ov("quiet", { quiet: true })];
    expect(clashes(events, overlays, ZONE)).toEqual([]);
    // The overlays are what keep them out: without them, they clash again.
    expect(pairs(clashes(events, [ov("quiet", { quiet: false })], ZONE))).toEqual([["a", "archived", "hard"], ["a", "quiet", "hard"], ["archived", "quiet", "hard"]]);
  });

  test("a removed overlay doesn't keep an engagement quiet", () => {
    const events = [ev("a", at("09:00"), at("10:00")), ev("b", at("09:00"), at("10:00"))];
    expect(clashes(events, [ov("b", { quiet: true, _deleted: true })], ZONE)).toHaveLength(1);
  });

  test("a linked child never clashes with its parent, but does with others", () => {
    const events = [ev("visit", at("14:00"), at("17:00")), ev("speech", at("15:00"), at("15:30")), ev("call", at("15:15"), at("15:45"))];
    const overlays = [ov("speech", { parent: "visit" })];
    expect(pairs(clashes(events, overlays, ZONE))).toEqual([["speech", "call", "hard"], ["visit", "call", "hard"]]);
  });

  test("an all-day out-of-office day clashes as away with each timed engagement on it, in the office's zone", () => {
    // 2026-07-01 in London starts at 23:00 UTC the day before.
    const events = [
      ev("leave", "2026-06-30T23:00:00Z", "2026-07-01T23:00:00Z", { allDay: true, showAs: "oof" }),
      ev("early", "2026-06-30T23:30:00Z", "2026-07-01T00:30:00Z"), ev("next", "2026-07-01T23:30:00Z", "2026-07-02T00:30:00Z"),
      ev("busyDay", "2026-06-30T23:00:00Z", "2026-07-01T23:00:00Z", { allDay: true }), ev("free", "2026-07-01T09:00:00Z", "2026-07-01T10:00:00Z", { showAs: "free" }),
    ];
    expect(pairs(clashes(events, [], ZONE))).toEqual([["leave", "early", "away"]]);
  });

  test("an all-day out-of-office spanning days covers each of them", () => {
    const events = [ev("leave", at("00:00", "2026-11-23"), at("00:00", "2026-11-26"), { allDay: true, showAs: "oof" }), ev("x", at("10:00", "2026-11-25"), at("11:00", "2026-11-25")), ev("y", at("10:00", "2026-11-26"), at("11:00", "2026-11-26"))];
    expect(pairs(clashes(events, [], ZONE))).toEqual([["leave", "x", "away"]]);
  });

  test("a quiet out-of-office day gives no away clashes", () => {
    const events = [ev("leave", at("00:00"), at("00:00", "2026-11-26"), { allDay: true, showAs: "oof" }), ev("x", at("10:00"), at("11:00"))];
    expect(clashes(events, [ov("leave", { quiet: true })], ZONE)).toEqual([]);
  });

  test("by event: each side gets the worst severity and its partners", () => {
    const by = clashesByEvent([
      { first: "a", second: "b", severity: "soft", at: "" }, { first: "a", second: "c", severity: "hard", at: "" },
    ]);
    expect(by.get("a")).toEqual({ severity: "hard", with: ["b", "c"] });
    expect(by.get("b")).toEqual({ severity: "soft", with: ["a"] });
  });

  // B11, B12 and B13 over the synthetic diaries.
  describe("on the synthetic diary", () => {
    const NOW = new Date("2026-11-23T12:00:00Z");
    const diary = plantedDiary(NOW);
    const subject = (id: string) => diary.find((e) => e.id === id)?.subject;
    const days = Object.values(plantedDays(NOW));
    const onPlantedDays = (found: ReturnType<typeof clashes>) => found.filter((c) => days.includes(dateIn(c.at, ZONE)));

    test("B11: finds every planted clash at the right severity and nothing else", () => {
      const found = onPlantedDays(clashes(diary, [], ZONE)).map((c) => [subject(c.first), subject(c.second), c.severity]);
      expect(found).toEqual(PLANTED_CLASHES);
    });

    test("B12: a quiet engagement never clashes", () => {
      const quiet = diary.filter((e) => ["Investor call", "Press photo", "Leave"].includes(e.subject ?? "")).map((e) => ov(e.id, { quiet: true }));
      const found = onPlantedDays(clashes(diary, quiet, ZONE)).map((c) => [subject(c.first), subject(c.second)]);
      expect(found).toEqual([["Hold: sector call", "Budget check-in"], ["Visit: Northfield Works", "Speech: apprentices"]]);
    });

    test("B13: linking the speech under the visit ends their clash; moving it out flags it, and the link stays", () => {
      const visit = diary.find((e) => e.subject === "Visit: Northfield Works")!;
      const speech = diary.find((e) => e.subject === "Speech: apprentices")!;
      expect(suggestedParent(speech, diary, [], ZONE)?.id).toBe(visit.id);
      const link = [ov(speech.id, { parent: visit.id })];
      expect(onPlantedDays(clashes(diary, link, ZONE)).some((c) => c.second === speech.id)).toBe(false);
      expect(linkedOutside(diary, link).size).toBe(0);
      const moved = diary.map((e) => (e.id === speech.id ? { ...e, start: "2026-11-25T17:30:00Z", end: "2026-11-25T18:00:00Z" } : e));
      expect([...linkedOutside(moved, link)]).toEqual([speech.id]);
      expect(childrenOf(visit.id, moved, link).map((e) => e.id)).toEqual([speech.id]);
      expect(clashes(moved, link, ZONE).some((c) => c.second === speech.id && c.first === visit.id)).toBe(false);
    });
  });
});

describe("suggested links", () => {
  const visit = ev("visit", at("14:00"), at("17:00"));
  const speech = ev("speech", at("15:00"), at("15:30"));

  test("suggests the shortest engagement that holds it wholly and is at least twice as long", () => {
    const day = ev("day", at("09:00"), at("18:00"));
    expect(suggestedParent(speech, [day, visit, speech], [], ZONE)?.id).toBe("visit");
  });

  test("not when the other isn't twice as long, sticks out, is another principal's, all-day, or linked itself", () => {
    expect(suggestedParent(speech, [ev("v", at("15:00"), at("15:50")), speech], [], ZONE)).toBeUndefined();
    expect(suggestedParent(speech, [ev("v", at("15:10"), at("17:00")), speech], [], ZONE)).toBeUndefined();
    expect(suggestedParent(speech, [ev("v", at("14:00"), at("17:00"), { principal: "q" }), speech], [], ZONE)).toBeUndefined();
    expect(suggestedParent(speech, [ev("v", at("00:00"), at("00:00", "2026-11-26"), { allDay: true }), speech], [], ZONE)).toBeUndefined();
    expect(suggestedParent(speech, [visit, speech, ev("big", at("12:00"), at("18:00"))], [ov("visit", { parent: "big" })], ZONE)?.id).toBe("big");
  });

  test("exactly twice as long is enough", () => {
    expect(suggestedParent(speech, [ev("v", at("15:00"), at("16:00")), speech], [], ZONE)?.id).toBe("v");
  });

  test("nothing for an engagement already linked or one with children", () => {
    expect(suggestedParent(speech, [visit, speech], [ov("speech", { parent: "visit" })], ZONE)).toBeUndefined();
    const big = ev("big", at("12:00"), at("18:00"));
    expect(suggestedParent(visit, [big, visit, speech], [ov("speech", { parent: "visit" })], ZONE)).toBeUndefined();
  });
});
