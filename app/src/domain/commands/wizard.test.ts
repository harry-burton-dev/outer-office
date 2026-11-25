// @vitest-environment node
// wizard.apply (OUT-85): the clash wizard's fixes in one run, one log row per fix.
import { describe, expect, test } from "vitest";
import type { ImportDiff, ImportedEvent } from "../../import/types";
import { importApply } from "./import";
import { officeSave, principalSave } from "./office";
import { wizardApply } from "./wizard";
import { byId, fails, idOf, NOW, ok, oneDevice, rows, snapshot } from "./testing/world";

const event = (uid: string, start: string, end: string): ImportedEvent => ({
  uid, recurrenceId: "", start, end, allDay: false, subject: uid, location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z",
});
const diff = (added: ImportedEvent[]): ImportDiff => ({
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-01T00:00:00Z", added, changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0,
});

async function diary() {
  const a = await oneDevice();
  ok(a, officeSave, { now: NOW, name: "Office", timezone: "Europe/London" });
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff([
    event("visit", "2026-11-25T10:00:00Z", "2026-11-25T13:00:00Z"), event("speech", "2026-11-25T11:00:00Z", "2026-11-25T11:30:00Z"),
    event("call", "2026-11-25T12:30:00Z", "2026-11-25T13:30:00Z"), event("lunch", "2026-11-25T12:45:00Z", "2026-11-25T13:15:00Z"),
  ]) });
  const id = (uid: string) => idOf(a, "event", principal, uid);
  return { a, principal, id };
}

const officeLog = (a: Awaited<ReturnType<typeof diary>>["a"]) => rows(a, "log").filter((r) => !["import", "setup", "calendar"].includes(r.area ?? ""));

describe("wizard.apply", () => {
  test("applies a move, a quiet flag, a link and a note in one run, with one log row each", async () => {
    const { a, id } = await diary();
    const fixes = [
      { kind: "move", event: id("call"), start: "2026-11-25T15:00:00Z", end: "2026-11-25T16:00:00Z" },
      { kind: "quiet", event: id("lunch") },
      { kind: "link", event: id("speech"), parent: id("visit") },
      { kind: "note", events: [id("visit"), id("lunch")], note: "Ask whether lunch can be cut short" },
      { kind: "leave" },
    ] as const;
    expect(ok(a, wizardApply, { now: NOW, fixes })).toBe(4);
    expect(byId(a, "proposals", idOf(a, "proposal", id("call")))).toMatchObject({ kind: "move", start: "2026-11-25T15:00:00Z" });
    expect(byId(a, "overlays", idOf(a, "overlay", id("lunch")))).toMatchObject({ quiet: true, notes: "Sun 22 Nov: Ask whether lunch can be cut short" });
    expect(byId(a, "overlays", idOf(a, "overlay", id("speech")))).toMatchObject({ parent: id("visit") });
    expect(byId(a, "overlays", idOf(a, "overlay", id("visit")))).toMatchObject({ notes: "Sun 22 Nov: Ask whether lunch can be cut short" });
    expect(officeLog(a).map((r) => `${r.area}/${r.kind}`).sort()).toEqual(["overlay/linked", "overlay/note", "overlay/quiet", "proposal/move"]);
  });

  test("a note is added under the notes already there", async () => {
    const { a, id } = await diary();
    ok(a, wizardApply, { now: NOW, fixes: [{ kind: "note", events: [id("call"), id("lunch")], note: "First" }] });
    ok(a, wizardApply, { now: NOW, fixes: [{ kind: "note", events: [id("call"), id("lunch")], note: "Second" }] });
    expect(byId(a, "overlays", idOf(a, "overlay", id("call")))?.notes).toBe("Sun 22 Nov: First\nSun 22 Nov: Second");
  });

  test("quiet and a link on the same engagement both stick", async () => {
    const { a, id } = await diary();
    ok(a, wizardApply, { now: NOW, fixes: [{ kind: "quiet", event: id("speech") }, { kind: "link", event: id("speech"), parent: id("visit") }] });
    expect(byId(a, "overlays", idOf(a, "overlay", id("speech")))).toMatchObject({ quiet: true, parent: id("visit") });
  });

  test("only leaving changes nothing", async () => {
    const { a } = await diary();
    const before = snapshot(a);
    ok(a, wizardApply, { now: NOW, fixes: [{ kind: "leave" }] });
    expect(snapshot(a)).toBe(before);
  });

  test("a fix that breaks a rule fails the whole run and changes nothing", async () => {
    const { a, id } = await diary();
    const before = snapshot(a);
    // The call doesn't sit inside the visit, so it can't be linked under it.
    expect(fails(a, wizardApply, { now: NOW, fixes: [{ kind: "quiet", event: id("lunch") }, { kind: "link", event: id("call"), parent: id("visit") }] })).toMatch(/wholly inside/);
    expect(snapshot(a)).toBe(before);
  });
});
