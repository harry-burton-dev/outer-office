// @vitest-environment node
// proposal.moveGroup (OUT-85, brief 5.2, B18): a parent moves with the engagements linked under it.
import { describe, expect, test } from "vitest";
import type { ImportDiff, ImportedEvent } from "../../import/types";
import { importApply } from "./import";
import { principalSave } from "./office";
import { overlaySet } from "./overlay";
import { proposalMove, proposalMoveGroup } from "./proposals";
import { byId, fails, idOf, NOW, ok, oneDevice, rows } from "./testing/world";

const event = (uid: string, start: string, end: string): ImportedEvent => ({
  uid, recurrenceId: "", start, end, allDay: false, subject: uid, location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z",
});
const diff = (over: Partial<ImportDiff>): ImportDiff => ({
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-01T00:00:00Z", added: [], changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0, ...over,
});

async function visit() {
  const a = await oneDevice();
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  const events = [event("visit", "2026-11-25T10:00:00Z", "2026-11-25T13:00:00Z"), event("speech", "2026-11-25T11:00:00Z", "2026-11-25T11:30:00Z"),
    event("tour", "2026-11-25T12:00:00Z", "2026-11-25T12:45:00Z"), event("call", "2026-11-25T15:00:00Z", "2026-11-25T15:30:00Z")];
  ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ added: events }) });
  const id = (uid: string) => idOf(a, "event", principal, uid);
  ok(a, overlaySet, { now: NOW, event: id("speech"), parent: id("visit") });
  ok(a, overlaySet, { now: NOW, event: id("tour"), parent: id("visit") });
  return { a, principal, id, events };
}
const proposalOf = (a: Awaited<ReturnType<typeof visit>>["a"], event: string) => byId(a, "proposals", idOf(a, "proposal", event));

describe("proposal.moveGroup", () => {
  test("B18: one proposal per child at the same offset, all sharing the parent as their group", async () => {
    const { a, id } = await visit();
    expect(ok(a, proposalMoveGroup, { now: NOW, event: id("visit"), start: "2026-11-26T14:00:00Z", end: "2026-11-26T17:00:00Z" })).toBe(3);
    expect(proposalOf(a, id("visit"))).toMatchObject({ start: "2026-11-26T14:00:00Z", end: "2026-11-26T17:00:00Z", group: id("visit"), superseded: "" });
    expect(proposalOf(a, id("speech"))).toMatchObject({ start: "2026-11-26T15:00:00.000Z", end: "2026-11-26T15:30:00.000Z", group: id("visit") });
    expect(proposalOf(a, id("tour"))).toMatchObject({ start: "2026-11-26T16:00:00.000Z", end: "2026-11-26T16:45:00.000Z", group: id("visit") });
    expect(proposalOf(a, id("call"))).toBeUndefined();
    expect(rows(a, "proposals").filter((p) => !p._deleted)).toHaveLength(3);
    expect(rows(a, "log").filter((l) => l.area === "proposal" && l.kind === "move")).toHaveLength(3);
    // The diary itself doesn't move.
    expect(byId(a, "events", id("speech"))).toMatchObject({ start: "2026-11-25T11:00:00Z" });
  });

  test("a child gone from Outlook isn't moved", async () => {
    const { a, principal, id, events } = await visit();
    ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff({ gone: [{ ...events[2]!, id: id("tour"), principal, gone: false, moves: 0 }] }) });
    expect(ok(a, proposalMoveGroup, { now: NOW, event: id("visit"), start: "2026-11-25T14:00:00Z", end: "2026-11-25T17:00:00Z" })).toBe(2);
    expect(proposalOf(a, id("tour"))).toBeUndefined();
  });

  test("a child then moved on its own leaves the group", async () => {
    const { a, id } = await visit();
    ok(a, proposalMoveGroup, { now: NOW, event: id("visit"), start: "2026-11-26T14:00:00Z", end: "2026-11-26T17:00:00Z" });
    ok(a, proposalMove, { now: NOW, event: id("speech"), start: "2026-11-26T16:30:00Z", end: "2026-11-26T17:00:00Z" });
    expect(proposalOf(a, id("speech"))).toMatchObject({ group: "" });
    expect(proposalOf(a, id("tour"))).toMatchObject({ group: id("visit") });
  });

  test("refuses no change", async () => {
    const { a, id } = await visit();
    expect(fails(a, proposalMoveGroup, { now: NOW, event: id("visit"), start: "2026-11-25T10:00:00Z", end: "2026-11-25T13:00:00Z" })).toMatch(/already is/);
  });
});
