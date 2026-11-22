// @vitest-environment node
import { describe, expect, test } from "vitest";
import { principalSave } from "./office";
import { projectSave, sectionSave } from "./projects";
import { taskAdd, taskComplete, taskLink, taskMove, taskRemove, taskUpdate } from "./tasks";
import { allRows, byId, fails, idOf, makeTestWorld, NOW, ok, oneDevice, rows, snapshot, type Device } from "./testing/world";

const LATER = "2026-11-22T10:00:00.000Z";
const taskLog = (a: Device) => rows(a, "log").filter((r) => r.area === "task");

/** Runs fn and returns the log rows it added. */
function newLogRows(a: Device, fn: () => void) {
  const before = new Set(rows(a, "log").map((r) => r.id));
  fn();
  return rows(a, "log").filter((r) => !before.has(r.id));
}

describe("task.add", () => {
  test("with no project, creates the caller's Inbox and puts the task in it", async () => {
    const a = await oneDevice("user-a");
    const id = ok(a, taskAdd, { now: NOW, title: "Draft note" });
    const inbox = idOf(a, "inbox", "user-a");
    expect(byId(a, "projects", inbox)).toMatchObject({ name: "Inbox", owner: "user-a", inbox: true, archived: false });
    expect(byId(a, "tasks", id)).toMatchObject({
      title: "Draft note", project: inbox, section: "", priority: 4, done: false, assignment: "none",
      createdAt: NOW, createdBy: "user-a", principal: "",
    });
  });

  test("reuses an existing Inbox and orders later tasks after earlier ones", async () => {
    const a = await oneDevice("user-a");
    const first = ok(a, taskAdd, { now: NOW, title: "First" });
    const second = ok(a, taskAdd, { now: NOW, title: "Second" });
    expect(rows(a, "projects")).toHaveLength(1);
    expect(byId(a, "tasks", second)?.order ?? 0).toBeGreaterThan(byId(a, "tasks", first)?.order ?? 0);
  });

  test("writes exactly one log row, filed under the task's principal tag", async () => {
    const a = await oneDevice("user-a");
    const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
    let id = "";
    const added = newLogRows(a, () => { id = ok(a, taskAdd, { now: NOW, title: "Draft note", principal }); });
    expect(added).toEqual([expect.objectContaining({ area: "task", kind: "created", task: id, principal, by: "user-a", at: NOW })]);
  });

  test("puts a task in a given project and section with its fields", async () => {
    const a = await oneDevice();
    const project = ok(a, projectSave, { now: NOW, name: "Shared" });
    const section = ok(a, sectionSave, { now: NOW, project, name: "Upcoming" });
    const id = ok(a, taskAdd, { now: NOW, title: "Book room", project, section, priority: 1, due: "2026-11-24", deadline: "2026-11-27", notes: "Some notes" });
    expect(byId(a, "tasks", id)).toMatchObject({ project, section, priority: 1, due: "2026-11-24", deadline: "2026-11-27", notes: "Some notes" });
  });

  test("assigning on add offers the task to someone else, or accepts it for yourself", async () => {
    const a = await oneDevice("user-a");
    const other = ok(a, taskAdd, { now: NOW, title: "For B", assignee: "user-b" });
    const mine = ok(a, taskAdd, { now: NOW, title: "For me", assignee: "user-a" });
    expect(byId(a, "tasks", other)).toMatchObject({ assignee: "user-b", assignedBy: "user-a", assignment: "offered" });
    expect(byId(a, "tasks", mine)).toMatchObject({ assignee: "user-a", assignedBy: "user-a", assignment: "accepted" });
  });

  test.each([
    [{ title: "  " }, "can't be empty"],
    [{ title: "X", priority: 5 as 1 }, "Priority must be"],
    [{ title: "X", due: "27 nov" }, "YYYY-MM-DD"],
    [{ title: "X", deadline: "2026-02-30" }, "YYYY-MM-DD"],
    [{ title: "X", project: "nope" }, "project no longer exists"],
    [{ title: "X", principal: "nope" }, "principal no longer exists"],
  ])("fails on bad input and writes nothing (%#)", async (over, message) => {
    const a = await oneDevice();
    const before = snapshot(a);
    expect(fails(a, taskAdd, { now: NOW, ...over })).toContain(message);
    expect(snapshot(a)).toBe(before);
  });

  test("two devices adding to the same new Inbox converge on one Inbox project", async () => {
    const world = await makeTestWorld();
    const a1 = await world.device("user-a");
    const a2 = await world.device("user-a");
    ok(a1, taskAdd, { now: NOW, title: "From laptop" });
    ok(a2, taskAdd, { now: NOW, title: "From desktop" });
    await world.sync([a1, a2]);
    const inbox = idOf(a1, "inbox", "user-a");
    for (const device of [a1, a2]) {
      expect(rows(device, "projects").map((p) => p.id)).toEqual([inbox]);
      expect(rows(device, "tasks").map((t) => t.project)).toEqual([inbox, inbox]);
    }
  });
});

describe("task.update", () => {
  test("changes the given fields and logs one 'edited' row with before and after", async () => {
    const a = await oneDevice();
    const id = ok(a, taskAdd, { now: NOW, title: "Draft note" });
    const added = newLogRows(a, () => ok(a, taskUpdate, { now: LATER, id, title: "Draft letter" }));
    expect(byId(a, "tasks", id)?.title).toBe("Draft letter");
    expect(added).toEqual([expect.objectContaining({ kind: "edited", from: "Draft note", to: "Draft letter", task: id })]);
  });

  test("moving to another project puts the task at its end with no section", async () => {
    const a = await oneDevice();
    const id = ok(a, taskAdd, { now: NOW, title: "Draft note" });
    const project = ok(a, projectSave, { now: NOW, name: "Shared" });
    ok(a, taskUpdate, { now: LATER, id, project, principal: "" });
    expect(byId(a, "tasks", id)).toMatchObject({ project, section: "" });
  });

  test("fails when nothing changes, or the section belongs elsewhere, and writes nothing", async () => {
    const a = await oneDevice();
    const id = ok(a, taskAdd, { now: NOW, title: "Draft note" });
    const project = ok(a, projectSave, { now: NOW, name: "Shared" });
    const section = ok(a, sectionSave, { now: NOW, project, name: "Upcoming" });
    const before = snapshot(a);
    expect(fails(a, taskUpdate, { now: LATER, id, title: "Draft note" })).toContain("Nothing about the task has changed");
    expect(fails(a, taskUpdate, { now: LATER, id, section })).toContain("another project");
    expect(fails(a, taskUpdate, { now: LATER, id: "nope", title: "X" })).toContain("no longer exists");
    expect(snapshot(a)).toBe(before);
  });
});

describe("task.move", () => {
  test("places a task between its neighbours and logs one 'moved' row", async () => {
    const a = await oneDevice();
    const [t1, t2, t3] = ["One", "Two", "Three"].map((title) => ok(a, taskAdd, { now: NOW, title }));
    const added = newLogRows(a, () => ok(a, taskMove, { now: LATER, id: t3, previous: t1, next: t2 }));
    const order = (id: string) => byId(a, "tasks", id)?.order ?? 0;
    expect(order(t3)).toBeGreaterThan(order(t1));
    expect(order(t3)).toBeLessThan(order(t2));
    expect(added).toEqual([expect.objectContaining({ kind: "moved", task: t3 })]);
  });

  test("moves a task to another section of its project", async () => {
    const a = await oneDevice();
    const project = ok(a, projectSave, { now: NOW, name: "Shared" });
    const section = ok(a, sectionSave, { now: NOW, project, name: "Later" });
    const id = ok(a, taskAdd, { now: NOW, title: "One", project });
    const added = newLogRows(a, () => ok(a, taskMove, { now: LATER, id, section }));
    expect(byId(a, "tasks", id)?.section).toBe(section);
    expect(added).toEqual([expect.objectContaining({ kind: "moved", from: "", to: section })]);
  });

  test("refuses to place a task next to itself", async () => {
    const a = await oneDevice();
    const id = ok(a, taskAdd, { now: NOW, title: "One" });
    expect(fails(a, taskMove, { now: LATER, id, previous: id })).toContain("next to itself");
  });
});

describe("task.complete", () => {
  test("completing sets done, doneAt and doneBy; reopening clears them", async () => {
    const a = await oneDevice("user-a");
    const id = ok(a, taskAdd, { now: NOW, title: "One" });
    const done = newLogRows(a, () => ok(a, taskComplete, { now: LATER, id, done: true }));
    expect(byId(a, "tasks", id)).toMatchObject({ done: true, doneAt: LATER, doneBy: "user-a" });
    const reopened = newLogRows(a, () => ok(a, taskComplete, { now: LATER, id, done: false }));
    expect(byId(a, "tasks", id)).toMatchObject({ done: false, doneAt: "", doneBy: "" });
    expect([...done, ...reopened].map((r) => r.kind)).toEqual(["completed", "reopened"]);
  });

  test("fails when the task is already in that state", async () => {
    const a = await oneDevice();
    const id = ok(a, taskAdd, { now: NOW, title: "One" });
    expect(fails(a, taskComplete, { now: LATER, id, done: false })).toContain("already open");
  });
});

describe("task.link", () => {
  test("links and unlinks an engagement, one row each", async () => {
    const a = await oneDevice();
    const id = ok(a, taskAdd, { now: NOW, title: "One" });
    const linked = newLogRows(a, () => ok(a, taskLink, { now: LATER, id, event: "event-1" }));
    expect(byId(a, "tasks", id)?.event).toBe("event-1");
    const unlinked = newLogRows(a, () => ok(a, taskLink, { now: LATER, id, event: "" }));
    expect(byId(a, "tasks", id)?.event).toBe("");
    expect(linked).toEqual([expect.objectContaining({ kind: "linked", to: "event-1", event: "event-1" })]);
    expect(unlinked).toEqual([expect.objectContaining({ kind: "unlinked", from: "event-1", to: "" })]);
  });

  test("fails when the link would not change", async () => {
    const a = await oneDevice();
    const id = ok(a, taskAdd, { now: NOW, title: "One" });
    expect(fails(a, taskLink, { now: LATER, id, event: "" })).toContain("isn't linked");
  });
});

describe("task.remove", () => {
  test("sends a task to the bin and back, one row each", async () => {
    const a = await oneDevice();
    const id = ok(a, taskAdd, { now: NOW, title: "One" });
    const removed = newLogRows(a, () => ok(a, taskRemove, { now: LATER, id }));
    expect(rows(a, "tasks")).toHaveLength(0);
    expect(allRows(a, "tasks").find((t) => t.id === id)?._deleted).toBe(true);
    const restored = newLogRows(a, () => ok(a, taskRemove, { now: LATER, id, restore: true }));
    expect(rows(a, "tasks").map((t) => t.id)).toEqual([id]);
    expect([...removed, ...restored].map((r) => r.kind)).toEqual(["removed", "restored"]);
  });

  test("a task in the bin can't be edited, completed or removed again", async () => {
    const a = await oneDevice();
    const id = ok(a, taskAdd, { now: NOW, title: "One" });
    ok(a, taskRemove, { now: LATER, id });
    const before = snapshot(a);
    expect(fails(a, taskUpdate, { now: LATER, id, title: "Two" })).toContain("in the bin");
    expect(fails(a, taskComplete, { now: LATER, id, done: true })).toContain("in the bin");
    expect(fails(a, taskRemove, { now: LATER, id })).toContain("in the bin");
    expect(snapshot(a)).toBe(before);
  });

  test("restoring a task that is not in the bin fails", async () => {
    const a = await oneDevice();
    const id = ok(a, taskAdd, { now: NOW, title: "One" });
    expect(fails(a, taskRemove, { now: LATER, id, restore: true })).toContain("not in the bin");
  });
});

describe("every task command writes exactly one log row", () => {
  test("across a full run of commands", async () => {
    const a = await oneDevice();
    const id = ok(a, taskAdd, { now: NOW, title: "One" });
    ok(a, taskUpdate, { now: LATER, id, priority: 2 });
    ok(a, taskMove, { now: LATER, id });
    ok(a, taskComplete, { now: LATER, id, done: true });
    ok(a, taskLink, { now: LATER, id, event: "event-1" });
    ok(a, taskRemove, { now: LATER, id });
    expect(taskLog(a)).toHaveLength(6);
  });
});
