import { describe, expect, test } from "vitest";
import type { ImportDiff } from "../../import/types";
import { tasksOutOfStep } from "../tab-tasks";
import { tabApply, tabRemove, tabTemplateSave } from "./cards";
import { importApply } from "./import";
import { officeSave, principalSave } from "./office";
import { projectSave } from "./projects";
import { taskRetime } from "./tab-tasks";
import { byId, fails, idOf, NOW, ok, oneDevice, rows } from "./testing/world";

const LATER = "2026-11-22T10:00:00.000Z";
const BASE = { uid: "e1", recurrenceId: "", end: "2026-11-27T10:00:00Z", allDay: false, subject: "Board", location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z" };
// 09:00 UTC on Friday 27 November is 09:00 in London.
const START = "2026-11-27T09:00:00Z";
const diff = (over: Partial<ImportDiff>): ImportDiff => ({
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-31T00:00:00Z", added: [], changed: [], gone: [], returned: [],
  unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0, ...over,
});
const TASKS = [{ title: "Send the papers", daysBefore: 3, owner: "user-b" }, { title: "Book the room", daysBefore: 7, owner: "" }];

async function setUp() {
  const a = await oneDevice();
  ok(a, officeSave, { now: NOW, name: "Office", timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00", privatePolicy: "mask" });
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [{ ...BASE, start: START }] }) });
  const shared = ok(a, projectSave, { now: NOW, name: "Office" });
  const tabTemplate = ok(a, tabTemplateSave, { now: NOW, name: "Board meeting", tasks: TASKS });
  return { a, principal, shared, tabTemplate, event: idOf(a, "event", principal, "e1") };
}

describe("template tasks", () => {
  test("applying a tab creates its tasks once, due the right days before, in the shared project, owned as the template says (B33, D16)", async () => {
    const { a, principal, shared, tabTemplate, event } = await setUp();
    const tab = ok(a, tabApply, { now: NOW, event, tabTemplate });
    ok(a, tabApply, { now: NOW, event, tabTemplate });
    const tasks = rows(a, "tasks").slice().sort((x, y) => (x.due ?? "").localeCompare(y.due ?? ""));
    expect(tasks).toMatchObject([
      { title: "Book the room", due: "2026-11-20", event, principal, project: shared, tab, offsetDays: 7, assignee: "", assignment: "none" },
      { title: "Send the papers", due: "2026-11-24", event, principal, project: shared, tab, offsetDays: 3, assignee: "user-b", assignment: "offered" },
    ]);
    expect(rows(a, "log").filter((l) => l.area === "task" && l.kind === "created")).toHaveLength(2);
  });

  test("a tab removed and applied again doesn't duplicate its tasks", async () => {
    const { a, tabTemplate, event } = await setUp();
    const tab = ok(a, tabApply, { now: NOW, event, tabTemplate });
    ok(a, tabRemove, { now: NOW, id: tab });
    ok(a, tabApply, { now: NOW, event, tabTemplate });
    expect(rows(a, "tasks")).toHaveLength(2);
  });

  test("a task's days before must be a whole number from 0 to 365, and it needs a title", async () => {
    const { a, tabTemplate } = await setUp();
    expect(fails(a, tabTemplateSave, { now: NOW, id: tabTemplate, tasks: [{ title: "X", daysBefore: -1, owner: "" }] })).toMatch(/whole number/);
    expect(fails(a, tabTemplateSave, { now: NOW, id: tabTemplate, tasks: [{ title: "X", daysBefore: 1.5, owner: "" }] })).toMatch(/whole number/);
    expect(fails(a, tabTemplateSave, { now: NOW, id: tabTemplate, tasks: [{ title: " ", daysBefore: 1, owner: "" }] })).toMatch(/title/);
  });

  test("when the engagement moves, task.retime keeps each open task's offset (B38)", async () => {
    const { a, principal, tabTemplate, event } = await setUp();
    ok(a, tabApply, { now: NOW, event, tabTemplate });
    const before = byId(a, "events", event)!;
    const after = { ...BASE, start: "2026-12-02T09:00:00Z", end: "2026-12-02T10:00:00Z", sourceModified: "2026-11-21T09:00:00Z" };
    ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ changed: [{ before: { ...BASE, ...before, id: event, principal, gone: false, moves: 0 } as never, after, fields: ["start", "end"], moved: true }] }) });
    const moved = byId(a, "events", event)!;
    expect(tasksOutOfStep(moved, rows(a, "tasks"), "Europe/London")).toHaveLength(2);
    expect(ok(a, taskRetime, { now: LATER, event })).toBe(2);
    expect(rows(a, "tasks").map((t) => t.due).sort()).toEqual(["2026-11-25", "2026-11-29"]);
    expect(tasksOutOfStep(moved, rows(a, "tasks"), "Europe/London")).toEqual([]);
    expect(ok(a, taskRetime, { now: LATER, event })).toBe(0);
  });
});
