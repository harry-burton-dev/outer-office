// @vitest-environment node
// Viewers suggest (OUT-85, D15, B43): a suggestion changes nothing; Take makes
// exactly what it describes; Dismiss changes nothing else. One log row either way.
import { describe, expect, test } from "vitest";
import type { ImportDiff, ImportedEvent } from "../../import/types";
import { importApply } from "./import";
import { officeSave, principalSave } from "./office";
import { overlaySet } from "./overlay";
import { suggestionDismiss, suggestionMake, suggestionTake } from "./suggestions";
import { byId, fails, idOf, NOW, ok, oneDevice, rows, snapshot } from "./testing/world";

const event = (uid: string, start: string, end: string): ImportedEvent => ({
  uid, recurrenceId: "", start, end, allDay: false, subject: uid, location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z",
});

async function diary() {
  const a = await oneDevice();
  ok(a, officeSave, { now: NOW, name: "Office", timezone: "Europe/London" });
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  const diff: ImportDiff = {
    rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-01T00:00:00Z", changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0,
    added: [event("visit", "2026-11-25T10:00:00Z", "2026-11-25T13:00:00Z"), event("speech", "2026-11-25T11:00:00Z", "2026-11-25T11:30:00Z")],
  };
  ok(a, importApply, { now: NOW, principal, file: "f.ics", diff });
  const id = (uid: string) => idOf(a, "event", principal, uid);
  return { a, id };
}
const officeLog = (a: Awaited<ReturnType<typeof diary>>["a"]) => rows(a, "log").filter((r) => !["import", "setup", "calendar"].includes(r.area ?? ""));
const live = <T extends "proposals" | "overlays">(a: Awaited<ReturnType<typeof diary>>["a"], table: T) => rows(a, table).filter((r) => !r._deleted);

describe("suggestions", () => {
  test("making a suggestion writes one suggestion and changes nothing else", async () => {
    const { a, id } = await diary();
    const before = snapshot(a);
    const sid = ok(a, suggestionMake, { now: NOW, event: id("speech"), kind: "move", start: "2026-11-25T15:00:00Z", end: "2026-11-25T15:30:00Z" });
    expect(byId(a, "suggestions", sid)).toMatchObject({ event: id("speech"), kind: "move", state: "open", by: "user-a", start: "2026-11-25T15:00:00Z" });
    expect(live(a, "proposals")).toEqual([]);
    expect(officeLog(a)).toEqual([]);
    expect(snapshot(a)).not.toBe(before);
  });

  test("B43: taking a move makes exactly that proposal, once", async () => {
    const { a, id } = await diary();
    const sid = ok(a, suggestionMake, { now: NOW, event: id("speech"), kind: "move", start: "2026-11-25T15:00:00Z", end: "2026-11-25T15:30:00Z" });
    ok(a, suggestionTake, { now: NOW, id: sid });
    expect(live(a, "proposals")).toEqual([expect.objectContaining({ kind: "move", event: id("speech"), start: "2026-11-25T15:00:00Z", end: "2026-11-25T15:30:00Z" })]);
    expect(byId(a, "suggestions", sid)).toMatchObject({ state: "taken", doneBy: "user-a" });
    expect(officeLog(a).map((r) => `${r.area}/${r.kind}`)).toEqual(["proposal/move"]);
    expect(fails(a, suggestionTake, { now: NOW, id: sid })).toMatch(/already taken/);
  });

  test("B43: taking quiet, a link and a note makes exactly those", async () => {
    const { a, id } = await diary();
    for (const input of [
      { kind: "quiet" as const }, { kind: "link" as const, parent: id("visit") }, { kind: "note" as const, note: "Shorten the speech" },
    ]) ok(a, suggestionTake, { now: NOW, id: ok(a, suggestionMake, { now: NOW, event: id("speech"), ...input }) });
    expect(byId(a, "overlays", idOf(a, "overlay", id("speech")))).toMatchObject({ quiet: true, parent: id("visit"), notes: "Sun 22 Nov: Shorten the speech" });
    expect(officeLog(a).map((r) => `${r.area}/${r.kind}`).sort()).toEqual(["overlay/linked", "overlay/note", "overlay/quiet"]);
    expect(live(a, "proposals")).toEqual([]);
  });

  test("taking a move of a parent moves its group", async () => {
    const { a, id } = await diary();
    ok(a, overlaySet, { now: NOW, event: id("speech"), parent: id("visit") });
    ok(a, suggestionTake, { now: NOW, id: ok(a, suggestionMake, { now: NOW, event: id("visit"), kind: "move", start: "2026-11-25T14:00:00Z", end: "2026-11-25T17:00:00Z" }) });
    expect(live(a, "proposals").map((p) => [p.event, p.start, p.group])).toEqual(expect.arrayContaining([
      [id("visit"), "2026-11-25T14:00:00Z", id("visit")], [id("speech"), "2026-11-25T15:00:00.000Z", id("visit")],
    ]));
  });

  test("dismissing changes nothing but the suggestion, with one log row", async () => {
    const { a, id } = await diary();
    const sid = ok(a, suggestionMake, { now: NOW, event: id("speech"), kind: "quiet" });
    ok(a, suggestionDismiss, { now: NOW, id: sid });
    expect(byId(a, "suggestions", sid)).toMatchObject({ state: "dismissed", doneBy: "user-a" });
    expect(live(a, "overlays").filter((o) => o.event === id("speech"))).toEqual([]);
    expect(officeLog(a).map((r) => `${r.area}/${r.kind}`)).toEqual(["proposal/suggestion-dismissed"]);
    expect(fails(a, suggestionTake, { now: NOW, id: sid })).toMatch(/already dismissed/);
  });

  test("a move needs times, a link a parent, and a note its text", async () => {
    const { a, id } = await diary();
    expect(fails(a, suggestionMake, { now: NOW, event: id("speech"), kind: "move" })).toMatch(/date and time/);
    expect(fails(a, suggestionMake, { now: NOW, event: id("speech"), kind: "move", start: "2026-11-25T10:00:00Z", end: "2026-11-25T10:00:00Z" })).toMatch(/end after it starts/);
    expect(fails(a, suggestionMake, { now: NOW, event: id("speech"), kind: "link" })).toMatch(/link under/);
    expect(fails(a, suggestionMake, { now: NOW, event: id("speech"), kind: "note", note: " " })).toMatch(/note/);
  });
});
