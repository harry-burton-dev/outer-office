import { describe, expect, test } from "vitest";
import type { ImportDiff } from "../../import/types";
import { cardFieldsOf, cardIsBehind, cardTemplatesOf, tabIsBehind, fieldsOf, isComplete, optionsOf, progressOf, tabsOn, valuesOf } from "../cards";
import { cardAdd, cardRemove, cardSet, cardUpdate, tabApply, tabRemove, tabTemplateRemove, tabUpdate, tabTemplateSave, templateRemove, templateSave } from "./cards";
import { importApply } from "./import";
import { principalSave } from "./office";
import { byId, fails, idOf, NOW, ok, oneDevice, rows } from "./testing/world";

const DIFF: ImportDiff = {
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-01T00:00:00Z",
  added: [{ uid: "e1", recurrenceId: "", start: "2026-11-24T14:00:00Z", end: "2026-11-24T15:00:00Z", allDay: false, subject: "Meeting", location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z" }],
  changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0,
};

const DIAL_IN = [
  { id: "system", label: "System", type: "choice" as const, required: true, options: "Teams bridge | 020 7946 0000\nZoom room" },
  { id: "host", label: "Host dials", type: "check" as const },
];

async function setUp() {
  const a = await oneDevice();
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: DIFF });
  return { a, event: idOf(a, "event", principal, "e1") };
}

describe("templates", () => {
  test("a template keeps its shape and fields, and refuses bad ones", async () => {
    const { a } = await setUp();
    const id = ok(a, templateSave, { now: NOW, name: "Dial-in", shape: "phone", fields: DIAL_IN });
    expect(byId(a, "templates", id)).toMatchObject({ name: "Dial-in", shape: "phone", order: 0 });
    expect(fieldsOf(byId(a, "templates", id)?.fields).map((f) => f.label)).toEqual(["System", "Host dials"]);
    expect(fails(a, templateSave, { now: NOW, name: "dial-in" })).toMatch(/already a template/);
    expect(fails(a, templateSave, { now: NOW, name: "X", shape: "hexagon" })).toMatch(/shapes/);
    expect(fails(a, templateSave, { now: NOW, id, fields: [{ id: "a", label: "", type: "text" }] })).toMatch(/label/);
    expect(fails(a, templateSave, { now: NOW, id, fields: [{ id: "a", label: "Pick", type: "choice" }] })).toMatch(/option/);
    ok(a, templateRemove, { now: NOW, id });
    expect(rows(a, "templates")).toEqual([]);
  });

  test("choice options carry a detail after a bar", () => {
    expect(optionsOf(DIAL_IN[0]!)).toEqual([{ label: "Teams bridge", detail: "020 7946 0000" }, { label: "Zoom room", detail: "" }]);
  });
});

describe("cards", () => {
  test("a card goes on a meeting, fills in field by field, and is complete when its required fields are", async () => {
    const { a, event } = await setUp();
    const template = ok(a, templateSave, { now: NOW, name: "Dial-in", shape: "phone", fields: DIAL_IN });
    const card = ok(a, cardAdd, { now: NOW, event, template });
    const progress = () => progressOf(DIAL_IN, valuesOf(byId(a, "cards", card)?.values));
    expect(progress()).toEqual({ done: 0, total: 1 });
    ok(a, cardSet, { now: NOW, id: card, values: { host: "true" } });
    ok(a, cardSet, { now: NOW, id: card, values: { system: "Teams bridge" } });
    expect(valuesOf(byId(a, "cards", card)?.values)).toEqual({ host: "true", system: "Teams bridge" });
    expect(isComplete(progress())).toBe(true);
    expect(rows(a, "log").filter((l) => l.kind === "card-ready")).toMatchObject([{ event, note: "Dial-in", area: "overlay" }]);
    ok(a, cardSet, { now: NOW, id: card, values: { host: "false" } });
    expect(rows(a, "log").filter((l) => l.kind === "card-ready")).toHaveLength(1);
    ok(a, cardRemove, { now: NOW, id: card });
    expect(rows(a, "cards")).toEqual([]);
  });

  test("with no required fields, every field counts", () => {
    expect(progressOf([{ id: "a", label: "A", type: "text" }, { id: "b", label: "B", type: "check" }], { a: "x" })).toEqual({ done: 1, total: 2 });
  });
});

describe("tabs", () => {
  async function withTab() {
    const { a, event } = await setUp();
    const dialIn = ok(a, templateSave, { now: NOW, name: "Dial-in", shape: "phone", fields: DIAL_IN });
    const contact = ok(a, templateSave, { now: NOW, name: "Contact", shape: "user", fields: [{ id: "who", label: "Who", type: "text", required: true }] });
    const tabTemplate = ok(a, tabTemplateSave, { now: NOW, name: "Board meeting", shape: "briefcase", cards: [contact, dialIn] });
    return { a, event, dialIn, contact, tabTemplate };
  }

  test("a tab template keeps its cards in order, and refuses a removed template or a second name", async () => {
    const { a, dialIn, contact, tabTemplate } = await withTab();
    expect(cardTemplatesOf(byId(a, "tabTemplates", tabTemplate)?.cards)).toEqual([contact, dialIn]);
    expect(byId(a, "tabTemplates", tabTemplate)?.version).toBe(1);
    ok(a, tabTemplateSave, { now: NOW, id: tabTemplate, name: "Board" });
    expect(byId(a, "tabTemplates", tabTemplate)?.version).toBe(2);
    expect(fails(a, tabTemplateSave, { now: NOW, name: "board" })).toMatch(/already a tab/);
    expect(fails(a, tabTemplateSave, { now: NOW, id: tabTemplate, cards: ["nope"] })).toMatch(/removed/);
    ok(a, tabTemplateRemove, { now: NOW, id: tabTemplate });
    expect(rows(a, "tabTemplates")).toEqual([]);
  });

  test("applying a tab adds its cards once, each with its own copy of the template's fields", async () => {
    const { a, event, dialIn, contact, tabTemplate } = await withTab();
    const tab = ok(a, tabApply, { now: NOW, event, tabTemplate });
    expect(ok(a, tabApply, { now: NOW, event, tabTemplate })).toBe(tab);
    expect(tabsOn(rows(a, "tabs"), event).map((t) => t.id)).toEqual([tab]);
    expect(byId(a, "tabs", tab)).toMatchObject({ event, tabTemplate, version: 1, appliedAt: NOW, appliedBy: "user-a", via: "hand" });
    const cards = rows(a, "cards").filter((c) => c.tab === tab).sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
    expect(cards.map((c) => c.template)).toEqual([contact, dialIn]);
    expect(cardFieldsOf(cards[1]!, undefined).map((f) => f.id)).toEqual(["system", "host"]);
  });

  test("editing a tab template doesn't change its tabs until Update to the latest (B35)", async () => {
    const { a, event, dialIn, contact, tabTemplate } = await withTab();
    const tab = ok(a, tabApply, { now: NOW, event, tabTemplate });
    const contactCard = rows(a, "cards").find((c) => c.tab === tab && c.template === contact)!;
    const dialInCard = rows(a, "cards").find((c) => c.tab === tab && c.template === dialIn)!;
    ok(a, cardSet, { now: NOW, id: contactCard.id, values: { who: "Sam" } });
    const brief = ok(a, templateSave, { now: NOW, name: "Brief", shape: "file-text", fields: [{ id: "doc", label: "Brief", type: "text" }] });
    ok(a, tabTemplateSave, { now: NOW, id: tabTemplate, cards: [brief] });
    const behind = () => tabIsBehind(byId(a, "tabs", tab)!, byId(a, "tabTemplates", tabTemplate), rows(a, "cards").filter((c) => c.tab === tab), new Map(rows(a, "templates").map((t) => [t.id, t])));
    expect(rows(a, "cards").filter((c) => c.tab === tab).map((c) => c.template).sort()).toEqual([contact, dialIn].sort());
    expect(behind()).toBe(true);
    ok(a, tabUpdate, { now: NOW, id: tab });
    // The filled-in Contact card stays; the empty Dial-in goes; Brief arrives.
    expect(rows(a, "cards").filter((c) => c.tab === tab).map((c) => c.id).includes(dialInCard.id)).toBe(false);
    expect(rows(a, "cards").filter((c) => c.tab === tab).map((c) => c.template).sort()).toEqual([brief, contact].sort());
    expect(valuesOf(byId(a, "cards", contactCard.id)?.values)).toEqual({ who: "Sam" });
    expect(behind()).toBe(false);
  });

  test("a later template edit doesn't change a card; updating to the latest is the card's choice", async () => {
    const { a, event, dialIn, tabTemplate } = await withTab();
    const tab = ok(a, tabApply, { now: NOW, event, tabTemplate });
    const card = rows(a, "cards").find((c) => c.tab === tab && c.template === dialIn)!;
    ok(a, cardSet, { now: NOW, id: card.id, values: { system: "Zoom room" } });
    ok(a, templateSave, { now: NOW, id: dialIn, fields: [...DIAL_IN, { id: "pin", label: "PIN", type: "text", required: true }] });
    const stored = () => byId(a, "cards", card.id)!;
    expect(cardFieldsOf(stored(), byId(a, "templates", dialIn)).map((f) => f.id)).toEqual(["system", "host"]);
    expect(cardIsBehind(stored(), byId(a, "templates", dialIn))).toBe(true);
    ok(a, cardUpdate, { now: NOW, id: card.id });
    expect(cardFieldsOf(stored(), undefined).map((f) => f.id)).toEqual(["system", "host", "pin"]);
    expect(valuesOf(stored().values)).toEqual({ system: "Zoom room" });
    expect(cardIsBehind(stored(), byId(a, "templates", dialIn))).toBe(false);
  });

  test("a card keeps its form after its template is removed", async () => {
    const { a, event, dialIn } = await withTab();
    const card = ok(a, cardAdd, { now: NOW, event, template: dialIn });
    ok(a, templateRemove, { now: NOW, id: dialIn });
    expect(cardFieldsOf(byId(a, "cards", card)!, undefined).map((f) => f.label)).toEqual(["System", "Host dials"]);
    ok(a, cardSet, { now: NOW, id: card, values: { system: "Zoom room" } });
    expect(rows(a, "log").filter((l) => l.kind === "card-ready")).toHaveLength(1);
  });

  test("removing a tab removes its cards but not cards added on their own; applying it again starts afresh", async () => {
    const { a, event, dialIn, tabTemplate } = await withTab();
    const own = ok(a, cardAdd, { now: NOW, event, template: dialIn });
    const tab = ok(a, tabApply, { now: NOW, event, tabTemplate });
    ok(a, tabRemove, { now: NOW, id: tab });
    expect(rows(a, "cards").map((c) => c.id)).toEqual([own]);
    expect(rows(a, "tabs")).toEqual([]);
    expect(ok(a, tabApply, { now: NOW, event, tabTemplate })).toBe(tab);
    expect(rows(a, "cards").filter((c) => c.tab === tab)).toHaveLength(2);
  });
});
