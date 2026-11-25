import { describe, expect, test } from "vitest";
import type { ImportDiff, StoredEvent } from "../../import/types";
import { cardSet, tabApply, tabTemplateSave, templateSave } from "./cards";
import { importApply } from "./import";
import { officeSave, principalSave } from "./office";
import { tabKeep } from "./tab-triggers";
import { tagSave, tagsSet } from "./tags";
import { byId, fails, idOf, NOW, ok, oneDevice, rows, type Device } from "./testing/world";

const LATER = "2026-11-22T10:00:00.000Z";
const BASE = { uid: "e1", recurrenceId: "", start: "2026-11-27T09:00:00Z", end: "2026-11-27T10:00:00Z", allDay: false, subject: "Board", location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z" };
const diff = (over: Partial<ImportDiff>): ImportDiff => ({
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-31T00:00:00Z", added: [], changed: [], gone: [], returned: [],
  unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0, ...over,
});

async function setUp(categories = "") {
  const a = await oneDevice();
  ok(a, officeSave, { now: NOW, name: "Office", timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00", privatePolicy: "mask" });
  const principal = ok(a, principalSave, { now: NOW, code: "P", title: "P" });
  ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [{ ...BASE, categories }] }) });
  const who = ok(a, templateSave, { now: NOW, name: "Contact", fields: [{ id: "who", label: "Who", type: "text", required: true }] });
  return { a, principal, who, event: idOf(a, "event", principal, "e1") };
}

const tabsOf = (a: Device) => rows(a, "tabs");
const logKinds = (a: Device) => rows(a, "log").filter((l) => (l.kind ?? "").startsWith("tab-")).map((l) => l.kind ?? "");

describe("tag triggers", () => {
  async function withTag() {
    const s = await setUp();
    const board = ok(s.a, tagSave, { now: NOW, name: "Board" });
    const template = ok(s.a, tabTemplateSave, { now: NOW, name: "Board pack", cards: [s.who], tasks: [{ title: "Send the papers", daysBefore: 2, owner: "" }], triggerKind: "tag", trigger: board });
    return { ...s, board, template };
  }

  test("applying a tag applies its tab templates once: one tab, its cards with copied fields, its tasks dated (B33)", async () => {
    const { a, event, board, template } = await withTag();
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [board] });
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [board] });
    expect(tabsOf(a)).toMatchObject([{ event, tabTemplate: template, via: "tag", orphaned: "" }]);
    expect(rows(a, "cards").map((c) => JSON.parse(c.fields ?? "[]").map((f: { id: string }) => f.id))).toEqual([["who"]]);
    expect(rows(a, "tasks")).toMatchObject([{ title: "Send the papers", due: "2026-11-25", event }]);
    expect(logKinds(a)).toEqual(["tab-applied"]);
  });

  test("removing the tag removes an empty tab, orphans one with content, and applying it again restores the kept tab (B34)", async () => {
    const { a, event, board } = await withTag();
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [board] });
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [] });
    expect(tabsOf(a)).toEqual([]);
    expect(rows(a, "cards")).toEqual([]);
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [board] });
    const tab = tabsOf(a)[0]!;
    ok(a, cardSet, { now: NOW, id: rows(a, "cards")[0]!.id, values: { who: "Sam" } });
    ok(a, tagsSet, { now: LATER, target: "event", id: event, tags: [] });
    expect(byId(a, "tabs", tab.id)).toMatchObject({ orphaned: LATER });
    ok(a, tagsSet, { now: LATER, target: "event", id: event, tags: [board] });
    expect(tabsOf(a)).toMatchObject([{ id: tab.id, orphaned: "" }]);
    expect(rows(a, "cards")).toHaveLength(1);
    expect(logKinds(a).sort()).toEqual(["tab-applied", "tab-applied", "tab-orphaned", "tab-removed", "tab-restored"]);
  });

  test("Keep settles an orphaned tab, and a tab added by hand is never removed by a tag", async () => {
    const { a, event, board, template } = await withTag();
    ok(a, tabApply, { now: NOW, event, tabTemplate: template });
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [board] });
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [] });
    expect(tabsOf(a)).toMatchObject([{ via: "hand", orphaned: "" }]);
    const tab = tabsOf(a)[0]!.id;
    ok(a, tabKeep, { now: NOW, id: tab });
    expect(byId(a, "tabs", tab)).toMatchObject({ via: "hand", orphaned: "" });
  });

  test("a trigger must be a live tag or a known category", async () => {
    const { a, template } = await withTag();
    expect(fails(a, tabTemplateSave, { now: NOW, id: template, triggerKind: "tag", trigger: "nope" })).toMatch(/tag has been removed/);
    expect(fails(a, tabTemplateSave, { now: NOW, id: template, triggerKind: "category", trigger: "nope" })).toMatch(/category/);
    ok(a, tabTemplateSave, { now: NOW, id: template, triggerKind: "none" });
    expect(byId(a, "tabTemplates", template)).toMatchObject({ triggerKind: "none", trigger: "" });
  });
});

describe("category triggers", () => {
  test("a category newly on an engagement applies its tab templates during the import, once (B36)", async () => {
    const { a, principal, who, event } = await setUp("Travel");
    const travel = idOf(a, "category", "travel");
    const template = ok(a, tabTemplateSave, { now: NOW, name: "Trip", cards: [who], triggerKind: "category", trigger: travel });
    // Already carried before the template existed: nothing yet.
    expect(tabsOf(a)).toEqual([]);
    const stored = { ...BASE, ...byId(a, "events", event), id: event, principal, gone: false, moves: 0 } as StoredEvent;
    const after = { ...BASE, categories: "Travel, Board", subject: "Board trip", sourceModified: "2026-11-21T09:00:00Z" };
    ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ changed: [{ before: stored, after, fields: ["subject", "categories"], moved: false }] }) });
    expect(tabsOf(a)).toEqual([]);
    // A new engagement carrying it gets the tab.
    ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ added: [{ ...BASE, uid: "e2", categories: "Travel" }] }) });
    expect(tabsOf(a)).toMatchObject([{ event: idOf(a, "event", principal, "e2"), tabTemplate: template, via: "category" }]);
    expect(rows(a, "cards")).toHaveLength(1);
  });

  test("an engagement that gains the category gets the tab; losing it releases an empty tab", async () => {
    const { a, principal, who, event } = await setUp("Travel");
    const travel = idOf(a, "category", "travel");
    ok(a, tabTemplateSave, { now: NOW, name: "Trip", cards: [who], triggerKind: "category", trigger: travel });
    const change = async (categories: string, modified: string) => {
      const stored = { ...BASE, ...byId(a, "events", event), id: event, principal, gone: false, moves: 0 } as StoredEvent;
      ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ changed: [{ before: stored, after: { ...BASE, categories, sourceModified: modified }, fields: ["categories"], moved: false }] }) });
    };
    await change("", "2026-11-21T09:00:00Z");
    await change("Travel", "2026-11-21T10:00:00Z");
    expect(tabsOf(a)).toMatchObject([{ event, via: "category" }]);
    await change("", "2026-11-21T11:00:00Z");
    expect(tabsOf(a)).toEqual([]);
  });

  test("a masked engagement never gets a tab from its categories", async () => {
    const { a, principal, who } = await setUp("Travel");
    ok(a, tabTemplateSave, { now: NOW, name: "Trip", cards: [who], triggerKind: "category", trigger: idOf(a, "category", "travel") });
    ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ added: [{ ...BASE, uid: "m1", categories: "Travel", masked: true }] }) });
    expect(tabsOf(a)).toEqual([]);
  });
});
