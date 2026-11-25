// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { ImportDiff, ImportedEvent } from "../../import/types";
import { ME, seenId } from "../home";
import { settingsFor } from "../rules";
import { updatesFor, type Update } from "../updates";
import { ruleSettingSet } from "./alerts";
import { homeMarkSeen } from "./home";
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
  return updatesFor({
    user: d.user, now, timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00", principals: [{ id: principal }],
    log: rows(d, "log"), tasks: rows(d, "tasks"), events: rows(d, "events"), overlays: rows(d, "overlays"), seen: rows(d, "seen"),
    updateState: rows(d, "updateState"), settings: settingsFor(d.user, rows(d, "ruleSettings"), undefined),
    sync: new Map(), readiness: new Map(),
  });
}

/** Each update's kinds, or its rule when it has none; a sync run's or series' engagements one by one. */
const flat = (u: Update): string[] => (u.members.length > 0 ? u.members.flatMap(flat) : u.kinds.length > 0 ? u.kinds : [u.rules[0]]);
const kinds = (d: Device, principal: string, scope: string, now = LATEST) => {
  const g = home(d, principal, now).find((x) => x.scope === scope);
  return [...(g?.needs ?? []), ...(g?.info ?? [])].flatMap(flat).sort();
};

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

    // gone is off by default (v0.3 brief 5.3); the offered task needs b until b answers it.
    expect(kinds(b, principal, principal)).toEqual(["added", "moved"]);
    expect(kinds(b, principal, ME)).toEqual(["task-offered"]);

    ok(b, homeMarkSeen, { now: LATEST, scope: principal });
    ok(b, homeMarkSeen, { now: LATEST, scope: ME });
    expect(kinds(b, principal, principal)).toEqual([]);
    expect(kinds(b, principal, ME)).toEqual(["task-offered"]);
    ok(b, taskAssign, { now: LATEST, id: task, action: "accept" });
    expect(kinds(b, principal, ME)).toEqual([]);
  });

  test("the user who made the changes does not see them", async () => {
    const { a, principal } = await office();
    expect(kinds(a, principal, principal)).toEqual([]);
  });

  test("with nothing marked seen, Home shows the last seven days", async () => {
    const { b, principal } = await office();
    expect(kinds(b, principal, principal)).toEqual(["added", "added"]);
    expect(kinds(b, principal, principal, "2026-12-01T09:00:00.000Z")).toEqual([]);
  });

  test("a rule the user turned off hides its rows; the sync run's own update stays until that is off too", async () => {
    const { b, principal } = await office();
    ok(b, ruleSettingSet, { now: NOW, rule: "added", on: false });
    ok(b, ruleSettingSet, { now: NOW, rule: "short-notice", on: false });
    expect(kinds(b, principal, principal)).toEqual(["sync-applied"]);
    ok(b, ruleSettingSet, { now: NOW, rule: "sync-applied", on: false });
    expect(kinds(b, principal, principal)).toEqual([]);
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
    expect(kinds(b, principal, ME)).toEqual([]);
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
