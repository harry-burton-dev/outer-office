// @vitest-environment node
// Readiness, with planted-bug cases: each test would fail if its named mistake were made.
import { expect, test } from "vitest";
import type { Card, Tab, Template } from "./cards";
import { readinessByEvent } from "./readiness";

const REQUIRED = JSON.stringify([{ id: "who", label: "Who", type: "text", required: true }, { id: "note", label: "Note", type: "text" }]);
const OPTIONAL = JSON.stringify([{ id: "note", label: "Note", type: "text" }]);
const tab = (id: string, event: string, extra: Partial<Tab> = {}): Tab => ({ id, event, tabTemplate: "tt", ...extra }) as Tab;
const card = (id: string, event: string, tabId: string, values: Record<string, string>, fields = REQUIRED, extra: Partial<Card> = {}): Card =>
  ({ id, event, tab: tabId, template: "t", values: JSON.stringify(values), fields, ...extra }) as Card;
const read = (tabs: Tab[], cards: Card[], templates: Template[] = []) => readinessByEvent(tabs, cards, templates);

test("ready only when every required card on its tabs is complete", () => {
  const r = read([tab("x", "e1")], [card("c1", "e1", "x", { who: "Sam" }), card("c2", "e1", "x", {})]);
  expect(r.get("e1")).toEqual({ required: 2, done: 1, ready: false });
  expect(read([tab("x", "e1")], [card("c1", "e1", "x", { who: "Sam" })]).get("e1")).toEqual({ required: 1, done: 1, ready: true });
});

test("an engagement with no tabs needs no prep (bug: counting it as not ready)", () => {
  expect(read([], [card("c1", "e1", "", {})]).has("e1")).toBe(false);
});

test("a tab with only optional cards is ready (bug: treating every card as required)", () => {
  expect(read([tab("x", "e1")], [card("c1", "e1", "x", {}, OPTIONAL)]).get("e1")).toEqual({ required: 0, done: 0, ready: true });
});

test("a card added on its own doesn't count (bug: counting loose cards)", () => {
  expect(read([tab("x", "e1")], [card("c1", "e1", "", {})]).get("e1")?.ready).toBe(true);
});

test("removed tabs and removed cards don't count (bug: ignoring _deleted)", () => {
  expect(read([tab("x", "e1", { _deleted: true } as Partial<Tab>)], [card("c1", "e1", "x", {})]).has("e1")).toBe(false);
  expect(read([tab("x", "e1")], [card("c1", "e1", "x", {}, REQUIRED, { _deleted: true } as Partial<Card>)]).get("e1")?.ready).toBe(true);
});

test("a card reads its own copy of the fields, not its template's later edit (bug: reading the template)", () => {
  const edited = [{ id: "t", fields: REQUIRED } as Template];
  expect(read([tab("x", "e1")], [card("c1", "e1", "x", {}, OPTIONAL)], edited).get("e1")?.ready).toBe(true);
});

test("an older card with no copy reads its template's fields", () => {
  const templates = [{ id: "t", fields: REQUIRED } as Template];
  expect(read([tab("x", "e1")], [card("c1", "e1", "x", {}, "")], templates).get("e1")).toEqual({ required: 1, done: 0, ready: false });
});

test("each engagement counts only its own cards (bug: mixing engagements)", () => {
  const r = read([tab("x", "e1"), tab("y", "e2")], [card("c1", "e1", "x", { who: "A" }), card("c2", "e2", "y", {})]);
  expect([r.get("e1")?.ready, r.get("e2")?.ready]).toEqual([true, false]);
});
