// @vitest-environment node
import { describe, expect, test } from "vitest";
import { taskAssign, type AssignAction } from "./task-assign";
import { taskAdd, taskComplete } from "./tasks";
import { byId, fails, makeTestWorld, NOW, ok, rows, snapshot, type Device } from "./testing/world";

/** One shared folder; user-a and user-b each on their own device, kept in step. */
async function team() {
  const world = await makeTestWorld();
  const a = await world.device("user-a");
  const b = await world.device("user-b");
  const sync = () => world.sync([a, b]);
  const id = ok(a, taskAdd, { now: NOW, title: "Shared task" });
  await sync();
  return { a, b, sync, id };
}

const state = (d: Device, id: string) => byId(d, "tasks", id)?.assignment;
const run = (d: Device, id: string, action: AssignAction, assignee?: string) => d.data.run(taskAssign, { now: NOW, id, action, assignee });

/** Runs an action that should succeed and returns the one log row it wrote. */
function logged(d: Device, id: string, action: AssignAction, assignee?: string) {
  const before = new Set(rows(d, "log").map((r) => r.id));
  ok(d, taskAssign, { now: NOW, id, action, assignee });
  const added = rows(d, "log").filter((r) => !before.has(r.id));
  expect(added).toHaveLength(1);
  return added[0];
}

describe("task.assign from none", () => {
  test("assigning to someone else offers it, with assignedBy the caller", async () => {
    const { a, id } = await team();
    expect(logged(a, id, "assign", "user-b")).toMatchObject({ kind: "assigned", from: "", to: "user-b", area: "task", task: id });
    expect(byId(a, "tasks", id)).toMatchObject({ assignee: "user-b", assignedBy: "user-a", assignment: "offered" });
  });

  test("assigning to yourself accepts it", async () => {
    const { a, id } = await team();
    ok(a, taskAssign, { now: NOW, id, action: "assign", assignee: "user-a" });
    expect(byId(a, "tasks", id)).toMatchObject({ assignee: "user-a", assignedBy: "user-a", assignment: "accepted" });
  });

  test.each(["accept", "decline", "recall", "clear"] as const)("%s is not allowed and writes nothing", async (action) => {
    const { a, id } = await team();
    const before = snapshot(a);
    expect(fails(a, taskAssign, { now: NOW, id, action })).toContain("not assigned");
    expect(snapshot(a)).toBe(before);
  });

  test("assign needs someone to assign to", async () => {
    const { a, id } = await team();
    expect(fails(a, taskAssign, { now: NOW, id, action: "assign" })).toContain("Say who");
  });
});

describe("task.assign from offered", () => {
  async function offered() {
    const t = await team();
    ok(t.a, taskAssign, { now: NOW, id: t.id, action: "assign", assignee: "user-b" });
    await t.sync();
    return t;
  }

  test("the assignee accepts", async () => {
    const { b, id } = await offered();
    expect(logged(b, id, "accept").kind).toBe("accepted");
    expect(state(b, id)).toBe("accepted");
  });

  test("the assignee declines", async () => {
    const { b, id } = await offered();
    expect(logged(b, id, "decline").kind).toBe("declined");
    expect(state(b, id)).toBe("declined");
  });

  test("the assigner recalls, clearing the assignee", async () => {
    const { a, id } = await offered();
    expect(logged(a, id, "recall")).toMatchObject({ kind: "recalled", from: "user-b", to: "" });
    expect(byId(a, "tasks", id)).toMatchObject({ assignment: "none", assignee: "", assignedBy: "" });
  });

  test("only the assignee may accept, and only the assigner may recall", async () => {
    const { a, b, id } = await offered();
    expect(fails(a, taskAssign, { now: NOW, id, action: "accept" })).toContain("assigned to");
    expect(fails(b, taskAssign, { now: NOW, id, action: "recall" })).toContain("who assigned");
  });

  test.each(["assign", "clear"] as const)("%s is not allowed", async (action) => {
    const { a, id } = await offered();
    const before = snapshot(a);
    expect(run(a, id, action, "user-b").ok).toBe(false);
    expect(snapshot(a)).toBe(before);
  });
});

describe("task.assign from accepted", () => {
  async function accepted() {
    const t = await team();
    ok(t.a, taskAssign, { now: NOW, id: t.id, action: "assign", assignee: "user-b" });
    await t.sync();
    ok(t.b, taskAssign, { now: NOW, id: t.id, action: "accept" });
    await t.sync();
    return t;
  }

  test("the assignee hands it back, which declines it", async () => {
    const { b, id } = await accepted();
    expect(logged(b, id, "decline").kind).toBe("declined");
    expect(state(b, id)).toBe("declined");
  });

  test("the assigner recalls it", async () => {
    const { a, id } = await accepted();
    ok(a, taskAssign, { now: NOW, id, action: "recall" });
    expect(state(a, id)).toBe("none");
  });

  test.each(["assign", "accept", "clear"] as const)("%s is not allowed", async (action) => {
    const { a, b, id } = await accepted();
    expect(run(a, id, action, "user-b").ok).toBe(false);
    expect(run(b, id, action, "user-a").ok).toBe(false);
  });
});

describe("task.assign from declined", () => {
  async function declined() {
    const t = await team();
    ok(t.a, taskAssign, { now: NOW, id: t.id, action: "assign", assignee: "user-b" });
    await t.sync();
    ok(t.b, taskAssign, { now: NOW, id: t.id, action: "decline" });
    await t.sync();
    return t;
  }

  test("the assigner reassigns, which offers it again", async () => {
    const { a, id } = await declined();
    expect(logged(a, id, "assign", "user-c")).toMatchObject({ kind: "assigned", from: "user-b", to: "user-c" });
    expect(byId(a, "tasks", id)).toMatchObject({ assignee: "user-c", assignment: "offered" });
  });

  test("the assigner clears it", async () => {
    const { a, id } = await declined();
    ok(a, taskAssign, { now: NOW, id, action: "clear" });
    expect(byId(a, "tasks", id)).toMatchObject({ assignment: "none", assignee: "" });
  });

  test("only the assigner may reassign or clear", async () => {
    const { b, id } = await declined();
    expect(fails(b, taskAssign, { now: NOW, id, action: "clear" })).toContain("who assigned");
    expect(fails(b, taskAssign, { now: NOW, id, action: "assign", assignee: "user-c" })).toContain("who assigned");
  });

  test.each(["accept", "decline", "recall"] as const)("%s is not allowed", async (action) => {
    const { a, b, id } = await declined();
    expect(run(a, id, action).ok).toBe(false);
    expect(run(b, id, action).ok).toBe(false);
  });
});

describe("task.assign and completion", () => {
  test("completing is separate: an offered task can be completed and keeps its state", async () => {
    const { a, id } = await team();
    ok(a, taskAssign, { now: NOW, id, action: "assign", assignee: "user-b" });
    ok(a, taskComplete, { now: NOW, id, done: true });
    expect(byId(a, "tasks", id)).toMatchObject({ done: true, assignment: "offered" });
  });

  test("an unknown action fails", async () => {
    const { a, id } = await team();
    expect(fails(a, taskAssign, { now: NOW, id, action: "steal" as AssignAction })).toContain("must be assign");
  });
});
