// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { ImportDiff, ImportedEvent, StoredEvent } from "../../import/types";
import { importApply } from "./import";
import { principalSave } from "./office";
import { overlaySet } from "./overlay";
import { taskAdd } from "./tasks";
import { byId, fails, idOf, makeTestWorld, NOW, ok, oneDevice, rows, snapshot, type Device } from "./testing/world";

const LATER = "2026-11-22T10:00:00.000Z";

const event = (uid: string, over: Partial<ImportedEvent> = {}): ImportedEvent => ({
  uid, recurrenceId: "", start: "2026-11-24T14:00:00Z", end: "2026-11-24T15:00:00Z", allDay: false,
  subject: `Meeting ${uid}`, location: "Room 1", organizer: "organiser@example.com", categories: "",
  showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z", ...over,
});

const diff = (over: Partial<ImportDiff> = {}): ImportDiff => ({
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-31T00:00:00Z", added: [], changed: [], gone: [], returned: [],
  unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0, ...over,
});

async function withPrincipal(device?: Device): Promise<{ a: Device; principal: string }> {
  const a = device ?? (await oneDevice());
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  return { a, principal };
}

const stored = (a: Device, principal: string, uid: string): StoredEvent => {
  const row = byId(a, "events", idOf(a, "event", principal, uid));
  if (!row) throw new Error(`no stored event ${uid}`);
  return { ...event(uid), ...row, id: row.id, principal, gone: row.gone ?? false, moves: row.moves ?? 0 } as StoredEvent;
};

const calendarLog = (a: Device) => rows(a, "log").filter((r) => r.area === "calendar").map((r) => r.kind).sort();

describe("import.apply: adding", () => {
  test("adds events under tx.id('event', principal, uid, recurrenceId)", async () => {
    const { a, principal } = await withPrincipal();
    ok(a, importApply, { now: NOW, principal, file: "diary.ics", diff: diff({ added: [event("e1"), event("e2", { recurrenceId: "2026-11-25T14:00:00Z" })] }) });
    const id1 = idOf(a, "event", principal, "e1");
    const id2 = idOf(a, "event", principal, "e2", "2026-11-25T14:00:00Z");
    expect(byId(a, "events", id1)).toMatchObject({ principal, uid: "e1", subject: "Meeting e1", gone: false, moves: 0 });
    expect(byId(a, "events", id2)?.recurrenceId).toBe("2026-11-25T14:00:00Z");
  });

  test("writes one imports record with the counts and one log row per event plus one for the import", async () => {
    const { a, principal } = await withPrincipal();
    const result = ok(a, importApply, { now: NOW, principal, file: "diary.ics", diff: diff({ added: [event("e1"), event("e2")] }) });
    expect(result).toMatchObject({ added: 2, changed: 0, gone: 0, returned: 0 });
    expect(rows(a, "imports")).toEqual([expect.objectContaining({ id: result.importId, principal, at: NOW, by: "user-a", added: 2, changed: 0, gone: 0 })]);
    expect(calendarLog(a)).toEqual(["added", "added"]);
    const applied = rows(a, "log").filter((r) => r.area === "import");
    expect(applied).toEqual([expect.objectContaining({ kind: "applied", principal, note: expect.stringContaining("diary.ics") })]);
  });
});

describe("import.apply: changes", () => {
  test("a moved event raises moves by one and logs the old and new start", async () => {
    const { a, principal } = await withPrincipal();
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [event("e1")] }) });
    const after = event("e1", { start: "2026-11-24T16:00:00Z", end: "2026-11-24T17:00:00Z", sourceModified: "2026-11-21T09:00:00Z" });
    ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ changed: [{ before: stored(a, principal, "e1"), after, fields: ["start", "end"], moved: true }] }) });
    const id = idOf(a, "event", principal, "e1");
    expect(byId(a, "events", id)).toMatchObject({ start: "2026-11-24T16:00:00Z", moves: 1 });
    const moved = rows(a, "log").find((r) => r.kind === "moved");
    expect(moved).toMatchObject({ area: "calendar", event: id, from: "2026-11-24T14:00:00Z", to: "2026-11-24T16:00:00Z" });
  });

  test("a change that keeps the start logs 'changed' with a summary and leaves moves alone", async () => {
    const { a, principal } = await withPrincipal();
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [event("e1")] }) });
    const after = event("e1", { subject: "New subject", sourceModified: "2026-11-21T09:00:00Z" });
    const result = ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ changed: [{ before: stored(a, principal, "e1"), after, fields: ["subject"], moved: false }] }) });
    expect(result.changed).toBe(1);
    expect(byId(a, "events", idOf(a, "event", principal, "e1"))).toMatchObject({ subject: "New subject", moves: 0 });
    expect(rows(a, "log").find((r) => r.kind === "changed")?.note).toBe("Changed: subject");
  });

  test("a changed attendee response is applied even when nothing else changed", async () => {
    const { a, principal } = await withPrincipal();
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [event("e1", { requiredAttendees: "Blake <b@example.org> · no response" })] }) });
    const after = event("e1", { requiredAttendees: "Blake <b@example.org> · declined", sourceModified: "2026-11-21T09:00:00Z" });
    const result = ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ changed: [{ before: stored(a, principal, "e1"), after, fields: ["requiredAttendees"], moved: false }] }) });
    expect(result.changed).toBe(1);
    expect(byId(a, "events", idOf(a, "event", principal, "e1"))?.requiredAttendees).toBe("Blake <b@example.org> · declined");
    expect(rows(a, "log").find((r) => r.kind === "changed")?.note).toBe("Changed: requiredAttendees");
  });

  test("a change to the location alone is applied", async () => {
    const { a, principal } = await withPrincipal();
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [event("e1")] }) });
    const after = event("e1", { location: "Room 2", sourceModified: "2026-11-21T09:00:00Z" });
    const result = ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ changed: [{ before: stored(a, principal, "e1"), after, fields: ["location"], moved: false }] }) });
    expect(result.changed).toBe(1);
    expect(byId(a, "events", idOf(a, "event", principal, "e1"))?.location).toBe("Room 2");
  });

  test("a source without attendees or importance keeps the stored ones", async () => {
    const { a, principal } = await withPrincipal();
    const full = { requiredAttendees: "Blake <b@example.org>", optionalAttendees: "Casey <c@example.org>", importance: "high", sensitivity: "normal" };
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [event("e1", full)] }) });
    const after = event("e1", { subject: "Renamed", sourceModified: "2026-11-21T09:00:00Z" });
    ok(a, importApply, { now: LATER, principal, file: "Power Automate sync", diff: diff({ changed: [{ before: stored(a, principal, "e1"), after, fields: ["subject"], moved: false }] }) });
    expect(byId(a, "events", idOf(a, "event", principal, "e1"))).toMatchObject({ subject: "Renamed", ...full });
  });

  test("an update older than the stored LAST-MODIFIED is skipped", async () => {
    const { a, principal } = await withPrincipal();
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [event("e1")] }) });
    const after = event("e1", { subject: "Stale", sourceModified: "2026-11-01T09:00:00Z" });
    ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ changed: [{ before: stored(a, principal, "e1"), after, fields: ["subject"], moved: false }] }) });
    expect(byId(a, "events", idOf(a, "event", principal, "e1"))?.subject).toBe("Meeting e1");
  });
});

describe("import.apply: gone and returned", () => {
  test("marks a missing event gone and keeps its overlay and tasks untouched", async () => {
    const { a, principal } = await withPrincipal();
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [event("e1")] }) });
    const id = idOf(a, "event", principal, "e1");
    ok(a, overlaySet, { now: NOW, event: id, prep: "needed", notes: "Brief notes" });
    ok(a, taskAdd, { now: NOW, title: "Prepare brief", event: id });
    const overlaysBefore = JSON.stringify(rows(a, "overlays"));
    const tasksBefore = JSON.stringify(rows(a, "tasks"));
    const result = ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ gone: [stored(a, principal, "e1")] }) });
    expect(result.gone).toBe(1);
    expect(byId(a, "events", id)?.gone).toBe(true);
    expect(JSON.stringify(rows(a, "overlays"))).toBe(overlaysBefore);
    expect(JSON.stringify(rows(a, "tasks"))).toBe(tasksBefore);
    expect(calendarLog(a)).toEqual(["added", "gone"]);
  });

  test("an event already gone is not marked gone or logged again", async () => {
    const { a, principal } = await withPrincipal();
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [event("e1")] }) });
    const before = stored(a, principal, "e1");
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ gone: [before] }) });
    const again = ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ gone: [before] }) });
    expect(again.gone).toBe(0);
    expect(calendarLog(a)).toEqual(["added", "gone"]);
  });

  test("a gone event that comes back has gone cleared and a 'returned' row", async () => {
    const { a, principal } = await withPrincipal();
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [event("e1")] }) });
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ gone: [stored(a, principal, "e1")] }) });
    const result = ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: diff({ returned: [{ before: stored(a, principal, "e1"), after: event("e1"), fields: [], moved: false }] }) });
    expect(result.returned).toBe(1);
    expect(byId(a, "events", idOf(a, "event", principal, "e1"))?.gone).toBe(false);
    expect(calendarLog(a)).toEqual(["added", "gone", "returned"]);
  });
});

describe("import.apply: convergence", () => {
  test("applying the same diff twice leaves one set of events and logs no second add", async () => {
    const { a, principal } = await withPrincipal();
    const same = diff({ added: [event("e1"), event("e2")] });
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: same });
    const second = ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: same });
    expect(second).toMatchObject({ added: 0, changed: 0, gone: 0 });
    expect(rows(a, "events")).toHaveLength(2);
    expect(calendarLog(a)).toEqual(["added", "added"]);
  });

  test("a moved diff applied twice raises moves only once", async () => {
    const { a, principal } = await withPrincipal();
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [event("e1")] }) });
    const after = event("e1", { start: "2026-11-24T16:00:00Z", sourceModified: "2026-11-21T09:00:00Z" });
    const moved = diff({ changed: [{ before: stored(a, principal, "e1"), after, fields: ["start"], moved: true }] });
    ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: moved });
    ok(a, importApply, { now: LATER, principal, file: "f.ics", diff: moved });
    expect(byId(a, "events", idOf(a, "event", principal, "e1"))?.moves).toBe(1);
  });

  test("the same import on two devices converges on one set of events", async () => {
    const world = await makeTestWorld();
    const a = await world.device("user-a");
    const b = await world.device("user-b");
    const { principal } = await withPrincipal(a);
    await world.sync([a, b]);
    const same = diff({ added: [event("e1"), event("e2"), event("e3")] });
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: same });
    ok(b, importApply, { now: NOW, principal, file: "f.ics", diff: same });
    await world.sync([a, b]);
    const ids = (d: Device) => rows(d, "events").map((r) => `${r.id}|${r.subject}|${r.start}`).sort();
    expect(ids(a)).toHaveLength(3);
    expect(ids(b)).toEqual(ids(a));
  });
});

describe("import.apply: bad input", () => {
  test.each([
    [{ principal: "nope" }, "principal no longer exists"],
    [{ diff: { ...diff(), added: "x" } as unknown as ImportDiff }, "incomplete"],
    [{ diff: diff({ rangeStart: "2026-12-31T00:00:00Z", rangeEnd: "2026-11-01T00:00:00Z" }) }, "date range"],
    [{ diff: diff({ added: [event("e1"), event("", {})] }) }, "no UID"],
    [{ diff: diff({ added: [event("e1", { start: "tomorrow" })] }) }, "bad start or end"],
    [{ now: "not a time" }, "current time"],
  ])("fails and writes nothing (%#)", async (over, message) => {
    const { a, principal } = await withPrincipal();
    const before = snapshot(a);
    expect(fails(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: [event("e1")] }), ...over })).toContain(message);
    expect(snapshot(a)).toBe(before);
  });
});
