// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { ImportDiff } from "../../import/types";
import { importApply } from "./import";
import { principalSave } from "./office";
import { overlaySet } from "./overlay";
import { byId, fails, idOf, NOW, ok, oneDevice, rows, snapshot, type Device } from "./testing/world";

const DIFF: ImportDiff = {
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-01T00:00:00Z",
  added: [{
    uid: "e1", recurrenceId: "", start: "2026-11-24T14:00:00Z", end: "2026-11-24T15:00:00Z", allDay: false, subject: "Meeting",
    location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z",
  }],
  changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0,
};

async function withEvent() {
  const a = await oneDevice();
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: DIFF });
  return { a, principal, event: idOf(a, "event", principal, "e1") };
}

const overlayLog = (a: Device) => rows(a, "log").filter((r) => r.area === "overlay");

describe("overlay.set", () => {
  test("creates the overlay under the predictable overlay id with defaults", async () => {
    const { a, event } = await withEvent();
    const id = ok(a, overlaySet, { now: NOW, event, notes: "Some notes" });
    expect(id).toBe(idOf(a, "overlay", event));
    expect(byId(a, "overlays", id)).toMatchObject({ event, prep: "none", flagged: false, notes: "Some notes" });
    expect(overlayLog(a)).toHaveLength(0);
  });

  test("logs a prep row with before and after when prep changes", async () => {
    const { a, principal, event } = await withEvent();
    ok(a, overlaySet, { now: NOW, event, prep: "needed" });
    expect(overlayLog(a)).toEqual([expect.objectContaining({ kind: "prep", from: "none", to: "needed", event, principal })]);
  });

  test("logs a flag row when only the flag changes", async () => {
    const { a, event } = await withEvent();
    ok(a, overlaySet, { now: NOW, event, flagged: true });
    expect(overlayLog(a).map((r) => [r.kind, r.from, r.to])).toEqual([["flag", "false", "true"]]);
  });

  test("writes no log row when neither prep nor the flag changes", async () => {
    const { a, event } = await withEvent();
    ok(a, overlaySet, { now: NOW, event, prep: "needed" });
    ok(a, overlaySet, { now: NOW, event, prep: "needed", notes: "More", outcome: "Agreed", prepOwner: "user-b" });
    expect(overlayLog(a)).toHaveLength(1);
    expect(byId(a, "overlays", idOf(a, "overlay", event))).toMatchObject({ prep: "needed", notes: "More", outcome: "Agreed", prepOwner: "user-b" });
  });

  test("fails on bad prep, a bad flag or an event that has not arrived, and writes nothing", async () => {
    const { a, event } = await withEvent();
    const before = snapshot(a);
    expect(fails(a, overlaySet, { now: NOW, event, prep: "maybe" as "none" })).toContain("Prep must be");
    expect(fails(a, overlaySet, { now: NOW, event: "event-missing", prep: "ready" })).toContain("hasn't arrived");
    expect(fails(a, overlaySet, { now: NOW, event, flagged: "yes" as unknown as boolean })).toContain("yes or no");
    expect(snapshot(a)).toBe(before);
  });
});
