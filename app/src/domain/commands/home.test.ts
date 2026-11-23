// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { ImportDiff, ImportedEvent } from "../../import/types";
import { homeChanges, ME, seenId } from "../home";
import { homeMarkSeen, homeSetWatch } from "./home";
import { importApply } from "./import";
import { principalSave } from "./office";
import { taskAssign } from "./task-assign";
import { taskAdd } from "./tasks";
import { byId, fails, idOf, makeTestWorld, NOW, ok, rows, snapshot, type Device } from "./testing/world";

const LATER = "2026-11-22T10:00:00.000Z";
const LATEST = "2026-11-22T11:00:00.000Z";

const event = (uid: string, over: Partial<ImportedEvent> = {}): ImportedEvent => ({
  uid, recurrenceId: "", start: "2026-11-24T14:00:00Z", end: "2026-11-24T15:00:00Z", allDay: false,
  subject: `Meeting ${uid}`, location: "Room 1", organizer: "organiser@example.com", categories: "",
  showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z", ...over,
});

const diff = (over: Partial<ImportDiff> = {}): ImportDiff => ({
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-31T00:00:00Z", added: [], changed: [], gone: [], returned: [],
  unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0, ...over,
});

/** user-a and user-b on one shared folder, with a principal and two meetings imported by user-a. */
async function office() {
  const world = await makeTestWorld();
  const a = await world.device("user-a");
  const b = await world.device("user-b");
  const sync = () => world.sync([a, b]);
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  ok(a, importApply, { now: NOW, principal, file: "diary.ics", diff: diff({ added: [event("e1"), event("e2")] }) });
  await sync();
  return { a, b, sync, principal };
}

function home(d: Device, principal: string, now = LATEST) {
  const person = byId(d, "people", idOf(d, "person", d.user));
  return homeChanges({
    user: d.user, log: rows(d, "log"), tasks: rows(d, "tasks"), seen: rows(d, "seen"), watchOff: person?.watchOff,
    principals: [{ id: principal }], now,
  });
}

const kinds = (d: Device, principal: string, scope: string) =>
  home(d, principal).find((g) => g.scope === scope)?.rows.map((r) => r.kind).sort();

describe("Home after an import", () => {
  test("another user sees the moved, added and gone meetings and the task offered to them, until they mark them seen", async () => {
    const { a, b, sync, principal } = await office();
    ok(b, homeMarkSeen, { now: NOW, scope: principal });
    ok(b, homeMarkSeen, { now: NOW, scope: ME });
    await sync();
    const stored = (uid: string) => ({ ...event(uid), id: idOf(a, "event", principal, uid), principal, gone: false, moves: 0 });
    const moved = event("e1", { start: "2026-11-25T14:00:00Z", end: "2026-11-25T15:00:00Z", sourceModified: "2026-11-21T09:00:00Z" });
    ok(a, importApply, {
      now: LATER, principal, file: "diary.ics",
      diff: diff({ added: [event("e3")], changed: [{ before: stored("e1"), after: moved, fields: ["start", "end"], moved: true }], gone: [stored("e2")] }),
    });
    const task = ok(a, taskAdd, { now: LATER, title: "Brief the visit" });
    ok(a, taskAssign, { now: LATER, id: task, action: "assign", assignee: "user-b" });
    await sync();

    expect(kinds(b, principal, principal)).toEqual(["added", "gone", "moved"]);
    expect(kinds(b, principal, ME)).toEqual(["assigned"]);

    ok(b, homeMarkSeen, { now: LATEST, scope: principal });
    ok(b, homeMarkSeen, { now: LATEST, scope: ME });
    expect(kinds(b, principal, principal)).toEqual([]);
    expect(kinds(b, principal, ME)).toEqual([]);
  });

  test("the user who made the changes does not see them", async () => {
    const { a, principal } = await office();
    expect(kinds(a, principal, principal)).toEqual([]);
  });

  test("with nothing marked seen, Home shows the last seven days", async () => {
    const { b, principal } = await office();
    expect(kinds(b, principal, principal)).toEqual(["added", "added"]);
    expect(home(b, principal, "2026-12-01T09:00:00.000Z")[0].rows).toEqual([]);
  });

  test("a rule the user turned off hides its rows; an import row shows only when turned on", async () => {
    const { b, principal } = await office();
    const all = ["event-moved", "event-changed", "event-gone", "event-returned", "import-applied"];
    ok(b, homeSetWatch, { now: NOW, on: all });
    expect(kinds(b, principal, principal)).toEqual(["applied"]);
    expect(byId(b, "people", idOf(b, "person", "user-b"))?.watchOff).toContain("event-added");
  });

  test("a task offered to someone else is not on your Home", async () => {
    const { a, b, sync, principal } = await office();
    const task = ok(a, taskAdd, { now: LATER, title: "Not yours" });
    ok(a, taskAssign, { now: LATER, id: task, action: "assign", assignee: "user-c" });
    await sync();
    expect(kinds(b, principal, ME)).toEqual([]);
  });

  test("the assigner sees the answer to a task they offered", async () => {
    const { a, b, sync, principal } = await office();
    const task = ok(a, taskAdd, { now: LATER, title: "Yours" });
    ok(a, taskAssign, { now: LATER, id: task, action: "assign", assignee: "user-b" });
    await sync();
    ok(b, taskAssign, { now: LATER, id: task, action: "decline" });
    await sync();
    expect(kinds(a, principal, ME)).toEqual(["declined"]);
  });
});

describe("home.markSeen", () => {
  test("writes the caller's marker under tx.id('seen', user, scope) and never moves it back", async () => {
    const { b, principal } = await office();
    ok(b, homeMarkSeen, { now: LATER, scope: principal });
    const id = idOf(b, ...seenId("user-b", principal));
    expect(byId(b, "seen", id)).toMatchObject({ userId: "user-b", scope: principal, at: LATER });
    expect(ok(b, homeMarkSeen, { now: LATEST, scope: principal, upTo: NOW })).toBe(LATER);
    expect(byId(b, "seen", id)?.at).toBe(LATER);
  });

  test("logs nothing", async () => {
    const { b, principal } = await office();
    const before = rows(b, "log").length;
    ok(b, homeMarkSeen, { now: LATER, scope: principal });
    expect(rows(b, "log")).toHaveLength(before);
  });

  test.each([
    [{ now: NOW, scope: "nobody" }, "no longer exists"],
    [{ now: NOW, scope: "" }, "can't be empty"],
    [{ now: NOW, scope: ME, upTo: "yesterday" }, "not an ISO"],
  ])("fails on bad input and writes nothing (%#)", async (input, message) => {
    const { b } = await office();
    const before = snapshot(b);
    expect(fails(b, homeMarkSeen, input)).toContain(message);
    expect(snapshot(b)).toBe(before);
  });
});

describe("home.setWatch", () => {
  test("fails on an unknown rule and writes nothing", async () => {
    const { b } = await office();
    const before = snapshot(b);
    expect(fails(b, homeSetWatch, { now: NOW, on: ["event-added", "everything"] })).toContain("not a watch rule");
    expect(snapshot(b)).toBe(before);
  });

  test("all rules on is stored as none, so the default-off import rule stays on", async () => {
    const { b } = await office();
    ok(b, homeSetWatch, { now: NOW, on: ["event-added", "event-moved", "event-changed", "event-gone", "event-returned", "prep-changed", "flag-changed", "proposal-made", "proposal-withdrawn", "proposal-settled", "task-offered", "task-answered", "task-recalled", "task-created", "task-completed", "import-applied"] });
    expect(byId(b, "people", idOf(b, "person", "user-b"))?.watchOff).toBe("none");
  });
});
