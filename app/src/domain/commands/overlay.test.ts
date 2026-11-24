// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { ImportDiff } from "../../import/types";
import { importApply } from "./import";
import { officeSave, principalSave } from "./office";
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

const timed = (uid: string, start: string, end: string, extra: Partial<ImportDiff["added"][number]> = {}): ImportDiff["added"][number] =>
  ({ ...DIFF.added[0], uid, subject: uid, start, end, ...extra });

async function withDay() {
  const a = await oneDevice();
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  const other = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-B", title: "Principal B" });
  ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: { ...DIFF, added: [
    timed("visit", "2026-11-24T14:00:00Z", "2026-11-24T17:00:00Z"), timed("speech", "2026-11-24T15:00:00Z", "2026-11-24T15:30:00Z"),
    timed("late", "2026-11-24T16:30:00Z", "2026-11-24T17:30:00Z"), timed("tomorrow", "2026-11-25T15:00:00Z", "2026-11-25T15:30:00Z"),
    timed("allday", "2026-11-24T00:00:00Z", "2026-11-25T00:00:00Z", { allDay: true }), timed("gone", "2026-11-24T14:00:00Z", "2026-11-24T18:00:00Z"),
  ] } });
  ok(a, importApply, { now: NOW, principal: other, file: "g.ics", diff: { ...DIFF, added: [timed("theirs", "2026-11-24T14:00:00Z", "2026-11-24T18:00:00Z")] } });
  const id = (uid: string) => idOf(a, "event", uid === "theirs" ? other : principal, uid);
  return { a, principal, id };
}

describe("overlay.set: quiet, priority and links (OUT-84)", () => {
  test("a new overlay starts loud, unlinked and at p4", async () => {
    const { a, event } = await withEvent();
    const id = ok(a, overlaySet, { now: NOW, event, notes: "x" });
    expect(byId(a, "overlays", id)).toMatchObject({ quiet: false, parent: "", priority: 4 });
  });

  test("quiet and priority each write one log row with before and after, and none when unchanged", async () => {
    const { a, event } = await withEvent();
    ok(a, overlaySet, { now: NOW, event, quiet: true, priority: 2 });
    ok(a, overlaySet, { now: NOW, event, quiet: true, priority: 2 });
    expect(overlayLog(a).map((r) => [r.kind, r.from, r.to]).sort()).toEqual([["priority", "4", "2"], ["quiet", "false", "true"]]);
    expect(byId(a, "overlays", idOf(a, "overlay", event))).toMatchObject({ quiet: true, priority: 2 });
  });

  test("priority must be 1 to 4", async () => {
    const { a, event } = await withEvent();
    for (const bad of [0, 5, 2.5, "1"]) expect(fails(a, overlaySet, { now: NOW, event, priority: bad as number })).toMatch(/Priority must be|must be a number/);
    expect(ok(a, overlaySet, { now: NOW, event, priority: 1 })).toBeTruthy();
  });

  test("links a child wholly inside its parent and unlinks it, a log row each", async () => {
    const { a, id } = await withDay();
    ok(a, overlaySet, { now: NOW, event: id("speech"), parent: id("visit") });
    expect(byId(a, "overlays", idOf(a, "overlay", id("speech")))).toMatchObject({ parent: id("visit") });
    ok(a, overlaySet, { now: NOW, event: id("speech"), parent: "" });
    expect(byId(a, "overlays", idOf(a, "overlay", id("speech")))).toMatchObject({ parent: "" });
    expect(overlayLog(a).map((r) => [r.kind, r.from, r.to]).sort()).toEqual([["linked", "", id("visit")], ["unlinked", id("visit"), ""]]);
  });

  test("refuses links that stick out, cross days or diaries, are all-day, to itself, to a missing or gone one", async () => {
    const { a, principal, id } = await withDay();
    ok(a, importApply, { now: NOW, principal, file: "f2.ics", diff: { ...DIFF, added: [], gone: [byId(a, "events", id("gone")) as never] } });
    const before = snapshot(a);
    const link = (child: string, parent: string) => fails(a, overlaySet, { now: NOW, event: id(child), parent });
    expect(link("late", id("visit"))).toContain("wholly inside");
    expect(link("tomorrow", id("visit"))).toContain("same day");
    expect(link("speech", id("theirs"))).toContain("same diary");
    expect(link("speech", id("allday"))).toContain("All-day");
    expect(link("speech", id("speech"))).toContain("itself");
    expect(link("speech", "event-missing")).toContain("hasn't arrived");
    expect(link("speech", id("gone"))).toContain("gone from Outlook");
    expect(snapshot(a)).toBe(before);
  });

  test("links go one level deep", async () => {
    const { a, principal, id } = await withDay();
    ok(a, importApply, { now: NOW, principal, file: "f2.ics", diff: { ...DIFF, added: [timed("inner", "2026-11-24T15:05:00Z", "2026-11-24T15:10:00Z")] } });
    ok(a, overlaySet, { now: NOW, event: id("speech"), parent: id("visit") });
    expect(fails(a, overlaySet, { now: NOW, event: id("inner"), parent: id("speech") })).toContain("one level deep");
    expect(fails(a, overlaySet, { now: NOW, event: id("visit"), parent: id("gone") })).toContain("one level deep");
  });

  test("a link is checked on the office's day, not UTC's", async () => {
    const { a, principal, id } = await withDay();
    ok(a, officeSave, { now: NOW, name: "Office", timezone: "Pacific/Auckland" });
    // Both start on the 24th in UTC, but in Auckland (UTC+13) the evening starts at 23:00 on the 24th and the night at 00:00 on the 25th.
    ok(a, importApply, { now: NOW, principal, file: "f3.ics", diff: { ...DIFF, added: [timed("evening", "2026-11-24T10:00:00Z", "2026-11-24T12:00:00Z"), timed("night", "2026-11-24T11:00:00Z", "2026-11-24T11:30:00Z")] } });
    expect(fails(a, overlaySet, { now: NOW, event: id("night"), parent: id("evening") })).toContain("same day");
  });
});
