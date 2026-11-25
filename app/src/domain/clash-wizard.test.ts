// @vitest-environment node
// The clash wizard's suggestions (OUT-85, brief 8.2, B21 and B41's wizard part).
import { describe, expect, test } from "vitest";
import { PLANTED_CLASHES, PLANTED_PRINCIPAL, plantedDays } from "../import/testing/synthetic-diaries";
import { clashes } from "./clashes";
import { firstSuggestions, lowerOf, stillClashes, suggestedFixes, withFixes, wizardClashes, type Fix, type WizardWorld } from "./clash-wizard";
import { ev, ov, plantedDiary, ZONE } from "./testing/rows";

const at = (time: string, day = "2026-11-25") => `${day}T${time}:00Z`;
const world = (events: WizardWorld["events"], overlays: WizardWorld["overlays"] = []): WizardWorld =>
  ({ events, overlays, proposed: [], zone: ZONE, dayStart: "08:00", dayEnd: "18:00", now: at("07:00") });
const kinds = (fixes: Fix[]) => fixes.map((f) => (f.kind === "move" ? `move ${f.event} ${f.start.slice(11, 16)}` : f.kind === "quiet" ? `quiet ${f.event}` : f.kind === "link" ? `link ${f.event} under ${f.parent}` : f.kind));

describe("suggestedFixes", () => {
  test("in order: move the lower-priority one, move the other, quiet the lower-priority one, leave it", () => {
    const w = world([ev("a", at("09:00"), at("10:00")), ev("b", at("09:30"), at("10:30"))], [ov("a", { priority: 3 }), ov("b", { priority: 1 })]);
    const [clash] = clashes(w.events, w.overlays, ZONE);
    expect(kinds(suggestedFixes(w, clash!))).toEqual(["move a 08:00", "move b 08:00", "quiet a", "leave"]);
  });

  test("with equal priorities the shorter one gives way, and with equal lengths the later one", () => {
    const short = world([ev("a", at("09:00"), at("11:00")), ev("b", at("09:30"), at("10:00"))]);
    expect(lowerOf(short, clashes(short.events, [], ZONE)[0]!).lower).toBe("b");
    const shortFirst = world([ev("a", at("09:00"), at("09:30")), ev("b", at("09:15"), at("11:00"))]);
    expect(lowerOf(shortFirst, clashes(shortFirst.events, [], ZONE)[0]!).lower).toBe("a");
    const same = world([ev("a", at("09:00"), at("10:00")), ev("b", at("09:30"), at("10:30"))]);
    expect(lowerOf(same, clashes(same.events, [], ZONE)[0]!).lower).toBe("b");
  });

  test("offers a link when one sits wholly inside the other, and not when either is already linked", () => {
    const w = world([ev("visit", at("10:00"), at("13:00")), ev("speech", at("11:00"), at("11:30"))]);
    const [clash] = clashes(w.events, [], ZONE);
    expect(kinds(suggestedFixes(w, clash!))).toContain("link speech under visit");
    const linked = world(w.events, [ov("visit", { parent: "elsewhere" })]);
    expect(kinds(suggestedFixes(linked, clash!))).not.toContain("link speech under visit");
  });

  test("never moves an all-day engagement", () => {
    const w = world([ev("leave", at("00:00"), at("00:00", "2026-11-26"), { allDay: true, showAs: "oof" }), ev("fair", at("10:00"), at("11:00"))]);
    const [clash] = clashes(w.events, [], ZONE);
    expect(clash!.severity).toBe("away");
    expect(kinds(suggestedFixes(w, clash!)).filter((k) => k.startsWith("move"))).toEqual(["move fair 08:00"]);
  });
});

describe("withFixes and stillClashes", () => {
  test("an earlier move settles a later clash with the same engagement", () => {
    const w = world([ev("a", at("09:00"), at("10:00")), ev("b", at("09:30"), at("10:30")), ev("c", at("09:45"), at("10:15"))]);
    const steps = clashes(w.events, [], ZONE);
    const moved = withFixes(w, [{ kind: "move", event: "b", start: at("14:00"), end: at("15:00") }]);
    expect(steps.map((c) => stillClashes(moved, c))).toEqual(steps.map((c) => c.first !== "b" && c.second !== "b"));
  });

  test("a quiet fix and a link fix take the pair out", () => {
    const w = world([ev("visit", at("10:00"), at("13:00")), ev("speech", at("11:00"), at("11:30"))]);
    const [clash] = clashes(w.events, [], ZONE);
    expect(stillClashes(withFixes(w, [{ kind: "quiet", event: "speech" }]), clash!)).toBe(false);
    expect(stillClashes(withFixes(w, [{ kind: "link", event: "speech", parent: "visit" }]), clash!)).toBe(false);
    expect(stillClashes(withFixes(w, [{ kind: "leave" }]), clash!)).toBe(true);
  });
});

describe("B21: applying the first suggestion for every clash", () => {
  const NOW = new Date("2026-11-23T09:00:00Z");
  const diary = plantedDiary(NOW);
  const w: WizardWorld = { events: diary, overlays: [], proposed: [], zone: ZONE, dayStart: "08:00", dayEnd: "18:00", now: NOW.toISOString() };
  const day = (date: string) => wizardClashes(w, PLANTED_PRINCIPAL, `${date}T00:00:00Z`, `${date}T23:59:59Z`);
  const steps = Object.values(plantedDays(NOW)).flatMap(day);
  const subject = (id: string) => diary.find((e) => e.id === id)?.subject;

  test("the wizard covers every planted clash in time order", () => {
    expect(steps.map((c) => [subject(c.first), subject(c.second), c.severity])).toEqual(PLANTED_CLASHES);
  });

  test("leaves no clashes, apart from those left, and no moved engagement lands in a new one", () => {
    const chosen = firstSuggestions(w, steps);
    expect(chosen.filter((f) => f.kind === "move")).toHaveLength(steps.length);
    const after = withFixes(w, chosen);
    for (const clash of steps) expect(stillClashes(after, clash)).toBe(false);
    const moved = new Set(chosen.flatMap((f) => (f.kind === "move" ? [f.event] : [])));
    const asProposed = diary.map((e) => after.proposed.find((p) => p.id === e.id) ?? e);
    expect(clashes(asProposed, after.overlays, ZONE).filter((c) => moved.has(c.first) || moved.has(c.second))).toEqual([]);
  });

  test("leaving one step keeps exactly that clash", () => {
    const chosen = firstSuggestions(w, steps).map((f, i) => (i === 0 ? ({ kind: "leave" }) as Fix : f));
    const after = withFixes(w, chosen);
    expect(steps.filter((c) => stillClashes(after, c))).toEqual([steps[0]]);
  });

  test("skipping every step changes nothing", () => {
    expect(withFixes(w, steps.map(() => ({ kind: "leave" }) as Fix))).toEqual(w);
  });
});
