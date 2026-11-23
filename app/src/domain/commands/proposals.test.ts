import { describe, expect, test } from "vitest";
import type { ImportDiff } from "../../import/types";
import { diaryData } from "../../screens/calendar/calendar-data";
import { importApply } from "./import";
import { principalSave } from "./office";
import { proposalMove, proposalWithdraw } from "./proposals";
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
