// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { ImportDiff } from "../../import/types";
import { TAG_COLOURS, eventTags } from "../tags";
import { importApply } from "./import";
import { principalSave } from "./office";
import { overlaySet } from "./overlay";
import { categorySave, tagRemove, tagSave, tagsSet } from "./tags";
import { taskAdd } from "./tasks";
import { byId, fails, idOf, NOW, ok, oneDevice, rows } from "./testing/world";

const DIFF: ImportDiff = {
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-01T00:00:00Z",
  added: [{
    uid: "e1", recurrenceId: "", start: "2026-11-24T14:00:00Z", end: "2026-11-24T15:00:00Z", allDay: false, subject: "Meeting",
    location: "", organizer: "", categories: "Board, Travel", showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z",
  }],
  changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0,
};

async function setUp() {
  const a = await oneDevice();
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: DIFF });
  return { a, event: idOf(a, "event", principal, "e1") };
}

describe("tag.save", () => {
  test("adds tags in order, each with the next colour by default", async () => {
    const { a } = await setUp();
    const board = ok(a, tagSave, { now: NOW, name: "Board" });
    const prep = ok(a, tagSave, { now: NOW, name: "Prep", colour: TAG_COLOURS[5].value });
    expect(byId(a, "tags", board)).toMatchObject({ name: "Board", colour: TAG_COLOURS[0].value, order: 0 });
    expect(byId(a, "tags", prep)).toMatchObject({ name: "Prep", colour: TAG_COLOURS[5].value, order: 1 });
  });

  test("renames and recolours, and refuses a duplicate name or an unknown colour", async () => {
    const { a } = await setUp();
    const id = ok(a, tagSave, { now: NOW, name: "Board" });
    ok(a, tagSave, { now: NOW, name: "Other" });
    ok(a, tagSave, { now: NOW, id, name: "Board papers", colour: TAG_COLOURS[2].value });
    expect(byId(a, "tags", id)).toMatchObject({ name: "Board papers", colour: TAG_COLOURS[2].value });
    expect(fails(a, tagSave, { now: NOW, name: " other " })).toMatch(/already a tag called other/);
    expect(fails(a, tagSave, { now: NOW, id, colour: "#000000" })).toMatch(/tag colours/);
  });
});

describe("tags.set", () => {
  test("puts tags on an event's overlay, keeping its prep, and on a task", async () => {
    const { a, event } = await setUp();
    const tag = ok(a, tagSave, { now: NOW, name: "Urgent" });
    ok(a, overlaySet, { now: NOW, event, prep: "needed" });
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [tag, tag, "gone-tag"] });
    expect(byId(a, "overlays", idOf(a, "overlay", event))).toMatchObject({ prep: "needed", tags: tag });
    const task = ok(a, taskAdd, { now: NOW, title: "Call back" });
    ok(a, tagsSet, { now: NOW, target: "task", id: task, tags: [tag] });
    expect(byId(a, "tasks", task)?.tags).toBe(tag);
  });

  test("creates the overlay when the event has none", async () => {
    const { a, event } = await setUp();
    const tag = ok(a, tagSave, { now: NOW, name: "Urgent" });
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [tag] });
    expect(byId(a, "overlays", idOf(a, "overlay", event))).toMatchObject({ event, prep: "none", flagged: false, tags: tag });
  });
});

describe("eventTags", () => {
  test("B5: an event carries only its own tags; a category with a tag's name doesn't apply it", async () => {
    const { a, event } = await setUp();
    const urgent = ok(a, tagSave, { now: NOW, name: "Urgent" });
    ok(a, tagSave, { now: NOW, name: "board" });
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [urgent] });
    const overlay = byId(a, "overlays", idOf(a, "overlay", event));
    expect(byId(a, "events", event)?.categories).toBe("Board, Travel");
    expect(eventTags(overlay?.tags, rows(a, "tags")).map((t) => t.name)).toEqual(["Urgent"]);
    expect(rows(a, "categories").map((c) => c.name).sort()).toEqual(["Board", "Travel"]);
  });

  test("a removed tag is no longer shown", async () => {
    const { a, event } = await setUp();
    const board = ok(a, tagSave, { now: NOW, name: "Board" });
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [board] });
    ok(a, tagRemove, { now: NOW, id: board });
    expect(eventTags(byId(a, "overlays", idOf(a, "overlay", event))?.tags, rows(a, "tags"))).toEqual([]);
  });
});

describe("tags.set log rows", () => {
  test("each tag put on or taken off writes one row naming it; setting the same tags writes none", async () => {
    const { a, event } = await setUp();
    const [urgent, board] = [ok(a, tagSave, { now: NOW, name: "Urgent" }), ok(a, tagSave, { now: NOW, name: "Board" })];
    const tagLog = () => rows(a, "log").filter((r) => r.kind?.startsWith("tag-")).map((r) => [r.area, r.kind, r.event, r.note]).sort();
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [urgent, board] });
    expect(tagLog()).toEqual([["overlay", "tag-added", event, "Board"], ["overlay", "tag-added", event, "Urgent"]]);
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [board] });
    ok(a, tagsSet, { now: NOW, target: "event", id: event, tags: [board] });
    expect(tagLog()).toHaveLength(3);
    expect(tagLog()).toContainEqual(["overlay", "tag-removed", event, "Urgent"]);
  });
});

describe("category.save", () => {
  test("sets a category's colour and order, and refuses an unknown one or colour", async () => {
    const { a } = await setUp();
    const board = idOf(a, "category", "board");
    ok(a, categorySave, { now: NOW, id: board, colour: TAG_COLOURS[3].value, order: 5 });
    expect(byId(a, "categories", board)).toMatchObject({ name: "Board", colour: TAG_COLOURS[3].value, order: 5 });
    expect(fails(a, categorySave, { now: NOW, id: board, colour: "#000000" })).toContain("tag colours");
    expect(fails(a, categorySave, { now: NOW, id: "nope", colour: TAG_COLOURS[0].value })).toContain("hasn't arrived");
  });
});
