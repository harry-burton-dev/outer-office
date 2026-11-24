// @vitest-environment node
// Copy from last time, with planted-bug cases (B37).
import { expect, test } from "vitest";
import type { Card, Tab, Template } from "./cards";
import { copiedValues, lastTimeFor } from "./copy-from";

const FIELDS = JSON.stringify([
  { id: "who", label: "Who", type: "text" }, { id: "dial", label: "Dial", type: "choice", options: "A\nB" }, { id: "sent", label: "Sent", type: "check" },
]);
const ev = (id: string, start: string, more: Record<string, unknown> = {}) => ({ id, principal: "p", uid: id, recurrenceId: "", start, organizer: "org@x", masked: false, ...more }) as never;
const tab = (id: string, event: string, tabTemplate = "tt") => ({ id, event, tabTemplate }) as Tab;
const card = (id: string, tabId: string, event: string, values: Record<string, string>, template = "t") => ({ id, tab: tabId, event, template, values: JSON.stringify(values), fields: FIELDS }) as Card;
const NONE = new Map<string, Template>();

const FILLED = { who: "Sam", dial: "A", sent: "true" };
const TARGET = tab("now", "e0");
const world = (events: never[], tabs: Tab[], cards: Card[]) => lastTimeFor({ target: TARGET, events: [ev("e0", "2026-11-27T09:00:00Z"), ...events], tabs: [TARGET, ...tabs], cards: [card("c0", "now", "e0", {}), ...cards], templates: [] });

test("copies every field except ticks, and only into empty fields (bugs: copying ticks, overwriting)", () => {
  expect(copiedValues(card("s", "x", "e", FILLED), card("t", "y", "f", {}), NONE)).toEqual({ who: "Sam", dial: "A" });
  expect(copiedValues(card("s", "x", "e", FILLED), card("t", "y", "f", { who: "Kim" }), NONE)).toEqual({ dial: "A" });
});

test("the same series comes before a more recent meeting with the same organiser", () => {
  const events = [ev("s1", "2026-11-20T09:00:00Z", { uid: "e0", recurrenceId: "x" }), ev("o1", "2026-11-26T09:00:00Z")];
  const tabs = [tab("ts", "s1"), tab("to", "o1")];
  const cards = [card("cs", "ts", "s1", FILLED), card("co", "to", "o1", FILLED)];
  const target = [ev("e0", "2026-11-27T09:00:00Z", { uid: "e0", recurrenceId: "y" })];
  expect(lastTimeFor({ target: TARGET, events: [...target, ...events], tabs: [TARGET, ...tabs], cards: [card("c0", "now", "e0", {}), ...cards], templates: [] })?.id).toBe("ts");
});

test("otherwise the most recent earlier meeting with the same organiser (bug: picking the oldest)", () => {
  const events = [ev("a", "2026-10-01T09:00:00Z"), ev("b", "2026-11-01T09:00:00Z")];
  expect(world(events, [tab("ta", "a"), tab("tb", "b")], [card("ca", "ta", "a", FILLED), card("cb", "tb", "b", FILLED)])?.id).toBe("tb");
});

test("never a later meeting, one over 12 months old, another organiser or another kind of tab", () => {
  expect(world([ev("later", "2026-12-01T09:00:00Z")], [tab("t", "later")], [card("c", "t", "later", FILLED)])).toBeUndefined();
  expect(world([ev("old", "2025-11-01T09:00:00Z")], [tab("t", "old")], [card("c", "t", "old", FILLED)])).toBeUndefined();
  expect(world([ev("other", "2026-11-01T09:00:00Z", { organizer: "someone@else" })], [tab("t", "other")], [card("c", "t", "other", FILLED)])).toBeUndefined();
  expect(world([ev("kind", "2026-11-01T09:00:00Z")], [tab("t", "kind", "other-tt")], [card("c", "t", "kind", FILLED)])).toBeUndefined();
});

test("never from or to a masked item (bug: ignoring masked)", () => {
  expect(world([ev("m", "2026-11-01T09:00:00Z", { masked: true })], [tab("t", "m")], [card("c", "t", "m", FILLED)])).toBeUndefined();
  const target = [ev("e0", "2026-11-27T09:00:00Z", { masked: true }), ev("a", "2026-11-01T09:00:00Z")];
  expect(lastTimeFor({ target: TARGET, events: target, tabs: [TARGET, tab("t", "a")], cards: [card("c0", "now", "e0", {}), card("c", "t", "a", FILLED)], templates: [] })).toBeUndefined();
});

test("skips a last time that has nothing to give, such as only ticks (bug: offering an empty copy)", () => {
  const events = [ev("ticks", "2026-11-20T09:00:00Z"), ev("full", "2026-11-01T09:00:00Z")];
  expect(world(events, [tab("tt1", "ticks"), tab("tf", "full")], [card("c1", "tt1", "ticks", { sent: "true" }), card("c2", "tf", "full", FILLED)])?.id).toBe("tf");
});
