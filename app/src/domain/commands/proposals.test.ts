import { describe, expect, test } from "vitest";
import type { ImportDiff } from "../../import/types";
import { diaryData } from "../../screens/calendar/calendar-data";
import { importApply } from "./import";
import { principalSave } from "./office";
import { overlaySet } from "./overlay";
import { proposalMove, proposalNew, proposalWithdraw } from "./proposals";
import { byId, fails, idOf, NOW, ok, oneDevice, rows } from "./testing/world";

const START = "2026-11-24T14:00:00Z";
const END = "2026-11-24T15:00:00Z";
const DIFF: ImportDiff = {
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-01T00:00:00Z",
  added: [{ uid: "e1", recurrenceId: "", start: START, end: END, allDay: false, subject: "Meeting", location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z" }],
  changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0,
};

async function setUp() {
  const a = await oneDevice();
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: DIFF });
  return { a, principal, event: idOf(a, "event", principal, "e1") };
}

const LATER = { start: "2026-11-25T10:00:00Z", end: "2026-11-25T11:00:00Z" };

describe("proposal.move and proposal.withdraw", () => {
  test("a move is proposed, logged, and leaves the event where it is", async () => {
    const { a, event } = await setUp();
    ok(a, proposalMove, { now: NOW, event, ...LATER });
    expect(byId(a, "proposals", idOf(a, "proposal", event))).toMatchObject({ event, ...LATER, by: "user-a" });
    expect(byId(a, "events", event)).toMatchObject({ start: START, end: END });
    expect(rows(a, "log").some((l) => l.area === "proposal" && l.kind === "move" && l.to === LATER.start)).toBe(true);
  });

  test("refuses a backwards time or no change", async () => {
    const { a, event } = await setUp();
    expect(fails(a, proposalMove, { now: NOW, event, start: LATER.end, end: LATER.start })).toMatch(/end after it starts/);
    expect(fails(a, proposalMove, { now: NOW, event, start: START, end: END })).toMatch(/already is/);
  });

  test("withdrawing removes it, and a new move brings it back", async () => {
    const { a, event } = await setUp();
    ok(a, proposalMove, { now: NOW, event, ...LATER });
    ok(a, proposalWithdraw, { now: NOW, event });
    expect(rows(a, "proposals")).toEqual([]);
    expect(fails(a, proposalWithdraw, { now: NOW, event })).toMatch(/no proposal/);
    ok(a, proposalMove, { now: NOW, event, ...LATER });
    expect(rows(a, "proposals")).toHaveLength(1);
  });
});

describe("diary layers", () => {
  test("live ghosts a proposed event; proposed shows it at the new time with a ghost; the graveyard shows gone events", async () => {
    const { a, principal, event } = await setUp();
    ok(a, proposalMove, { now: NOW, event, ...LATER });
    const proposals = rows(a, "proposals");
    const live = diaryData(rows(a, "events"), [], principal, [], undefined, { layer: "live", proposals });
    expect(live.events.map((e) => [e.id, e.start])).toEqual([[event, START]]);
    expect(live.faces.get(event)).toMatchObject({ ghost: true, marks: ["Move proposed"] });

    const proposed = diaryData(rows(a, "events"), [], principal, [], undefined, { layer: "proposed", proposals });
    expect(proposed.events.map((e) => [e.id, e.start])).toEqual([[event, LATER.start], [`${event}::was`, START]]);
    expect(proposed.faces.get(event)).toMatchObject({ ghost: false, marks: ["Proposed"] });

    ok(a, importApply, { now: NOW, principal, file: "g.ics", diff: { ...DIFF, added: [], gone: [{ id: event, uid: "e1", recurrenceId: "" }] } as unknown as ImportDiff });
    const graveyard = diaryData(rows(a, "events"), [], principal, [], undefined, { layer: "graveyard", proposals: [] });
    expect(graveyard.events.map((e) => e.id)).toEqual([event]);
    expect(graveyard.faces.get(event)?.marks).toEqual(["Gone from Outlook"]);
  });
});

describe("proposed new meetings and archiving", () => {
  test("a new meeting is proposed with its fields, and an import that finds it settles it", async () => {
    const { a, principal } = await setUp();
    const id = ok(a, proposalNew, { now: NOW, principal, subject: "Regulator catch-up", start: "2026-11-26T13:00:00Z", end: "2026-11-26T14:00:00Z", online: true, importance: "high" });
    expect(byId(a, "proposals", id)).toMatchObject({ kind: "new", subject: "Regulator catch-up", online: true, importance: "high", showAs: "busy", sensitivity: "normal" });
    expect(fails(a, proposalNew, { now: NOW, principal, subject: "", start: "2026-11-26T13:00:00Z", end: "2026-11-26T14:00:00Z" })).toMatch(/subject/i);
    expect(fails(a, proposalNew, { now: NOW, principal, subject: "X", start: "2026-11-26T13:00:00Z", end: "2026-11-26T14:00:00Z", showAs: "away" as never })).toMatch(/Show as/);
    const found = { ...DIFF.added[0]!, uid: "e2", subject: "regulator catch-up ", start: "2026-11-26T13:00:00Z", end: "2026-11-26T14:00:00Z" };
    ok(a, importApply, { now: NOW, principal, file: "g.ics", diff: { ...DIFF, added: [found] } });
    expect(rows(a, "proposals")).toEqual([]);
    expect(rows(a, "log").some((l) => l.kind === "settled")).toBe(true);
  });

  test("a move settles once Outlook has the meeting at the new time", async () => {
    const { a, principal, event } = await setUp();
    ok(a, proposalMove, { now: NOW, event, ...LATER });
    ok(a, importApply, { now: NOW, principal, file: "g.ics", diff: { ...DIFF, added: [], changed: [{ id: event, before: DIFF.added[0], after: { ...DIFF.added[0]!, ...LATER, sourceModified: "2026-11-23T10:00:00Z" } }] } as unknown as ImportDiff });
    expect(byId(a, "events", event)).toMatchObject(LATER);
    expect(rows(a, "proposals")).toEqual([]);
  });

  test("archiving moves a meeting to the graveyard, and it can come back", async () => {
    const { a, principal, event } = await setUp();
    ok(a, overlaySet, { now: NOW, event, archived: true });
    const at = (layer: "live" | "graveyard") => diaryData(rows(a, "events"), rows(a, "overlays"), principal, [], undefined, { layer, proposals: [] });
    expect(at("live").events).toEqual([]);
    expect(at("graveyard").faces.get(event)).toMatchObject({ archived: true, marks: ["Archived"] });
    ok(a, overlaySet, { now: NOW, event, archived: false });
    expect(at("live").events.map((e) => e.id)).toEqual([event]);
    expect(rows(a, "log").filter((l) => l.kind === "archived" || l.kind === "unarchived")).toHaveLength(2);
  });

  test("the Proposed layer veils the unchanged live diary by the slider, not the proposals", async () => {
    const { a, principal } = await setUp();
    ok(a, proposalNew, { now: NOW, principal, subject: "New one", start: "2026-11-26T13:00:00Z", end: "2026-11-26T14:00:00Z" });
    const data = diaryData(rows(a, "events"), [], principal, [], undefined, { layer: "proposed", proposals: rows(a, "proposals"), liveAlpha: 0.25 });
    const faces = [...data.faces.values()];
    expect(faces.find((f) => f.title === "Meeting")?.veil).toBe(0.75);
    expect(faces.find((f) => f.title === "New one")?.marks).toEqual(["New"]);
    expect(faces.find((f) => f.title === "New one")?.veil).toBeUndefined();
  });
});
