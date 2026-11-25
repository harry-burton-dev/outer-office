// @vitest-environment node
// import.apply and everything Outlook sends (OUT-83): field history, categories, series records.
import { describe, expect, test } from "vitest";
import type { ImportDiff, ImportedEvent, StoredEvent } from "../../import/types";
import { diffImport } from "../../import/diff";
import { importApply } from "./import";
import { heldBack } from "../../automate/apply-diary";
import { overlaySet } from "./overlay";
import { cardAdd, templateSave } from "./cards";
import { taskAdd } from "./tasks";
import { proposalMove } from "./proposals";
import { principalSave } from "./office";
import { byId, idOf, NOW, ok, oneDevice, rows, type Device } from "./testing/world";

const LATER = "2026-11-22T10:00:00.000Z";
const LATEST = "2026-11-23T10:00:00.000Z";

const event = (uid: string, over: Partial<ImportedEvent> = {}): ImportedEvent => ({
  uid, recurrenceId: "", start: "2026-11-24T14:00:00.000Z", end: "2026-11-24T15:00:00.000Z", allDay: false,
  subject: `Meeting ${uid}`, location: "Room 1", organizer: "Sam", categories: "",
  showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00.000Z",
  source: "automate", kind: "single", seriesId: "", outlookId: `id-${uid}`, body: "Agenda", raw: `{"id":"id-${uid}"}`, ...over,
});

const occurrence = (uid: string, start: string, over: Partial<ImportedEvent> = {}): ImportedEvent =>
  event(uid, { recurrenceId: start, start, end: new Date(Date.parse(start) + 3_600_000).toISOString(), kind: "occurrence", seriesId: uid, subject: "Weekly", ...over });

const RANGE = { rangeStart: "2026-11-01T00:00:00.000Z", rangeEnd: "2026-12-31T00:00:00.000Z" };

async function setUp(): Promise<{ a: Device; principal: string }> {
  const a = await oneDevice();
  return { a, principal: ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" }) };
}

const storedOf = (a: Device, principal: string): StoredEvent[] =>
  rows(a, "events").map((r) => ({ ...(r as unknown as StoredEvent), principal, gone: r.gone ?? false, moves: r.moves ?? 0 }));

/** Applies the events as a whole file: diffed against what is stored, as the sync does. */
function sync(a: Device, principal: string, events: readonly ImportedEvent[], now = NOW): ImportDiff {
  const d = diffImport(storedOf(a, principal), { events, ...RANGE, droppedPrivate: 0, maskedPrivate: 0, warnings: [] });
  ok(a, importApply, { now, principal, file: "Power Automate sync", diff: d });
  return d;
}

const history = (a: Device) => rows(a, "eventHistory").map(({ field, from, to, source }) => ({ field, from, to, source }));

describe("events v3", () => {
  test("every field the sync sends is stored", async () => {
    const { a, principal } = await setUp();
    sync(a, principal, [event("e1", { joinUrl: "https://teams.example/join", online: true, response: "accepted", attendees: "[]" })]);
    expect(byId(a, "events", idOf(a, "event", principal, "e1"))).toMatchObject({
      source: "automate", kind: "single", outlookId: "id-e1", body: "Agenda", raw: '{"id":"id-e1"}',
      joinUrl: "https://teams.example/join", online: true, response: "accepted", attendees: "[]",
    });
  });

  test("a field a later source doesn't carry keeps the sync's value", async () => {
    const { a, principal } = await setUp();
    sync(a, principal, [event("e1")]);
    const { outlookId: _o, raw: _r, ...fromIcs } = event("e1", { source: "ics", location: "Room 2", sourceModified: LATER });
    sync(a, principal, [fromIcs], LATER);
    expect(byId(a, "events", idOf(a, "event", principal, "e1"))).toMatchObject({ source: "ics", outlookId: "id-e1", raw: '{"id":"id-e1"}', location: "Room 2" });
  });
});

describe("field history", () => {
  test("B2: a changed location writes one history row whose from is the previous sync's value", async () => {
    const { a, principal } = await setUp();
    sync(a, principal, [event("e1")]);
    expect(rows(a, "eventHistory")).toEqual([]);
    sync(a, principal, [event("e1", { location: "Room 9", sourceModified: LATER })], LATER);
    expect(history(a)).toEqual([{ field: "location", from: "Room 1", to: "Room 9", source: "automate" }]);
    expect(rows(a, "eventHistory")[0]).toMatchObject({ event: idOf(a, "event", principal, "e1"), at: LATER });
  });

  test("B40: a body change writes a history row with empty from and to", async () => {
    const { a, principal } = await setUp();
    sync(a, principal, [event("e1")]);
    sync(a, principal, [event("e1", { body: "New agenda: <b>secret</b>", sourceModified: LATER })], LATER);
    expect(history(a)).toEqual([{ field: "body", from: "", to: "", source: "automate" }]);
    expect(byId(a, "events", idOf(a, "event", principal, "e1"))?.body).toBe("New agenda: <b>secret</b>");
  });

  test("filling in what a row stored before v3 never had is history, but not a change to the meeting", async () => {
    const { a, principal } = await setUp();
    const { source: _s, outlookId: _o, body: _b, raw: _r, kind: _k, seriesId: _i, ...v2 } = event("e1");
    sync(a, principal, [{ ...v2, source: undefined } as ImportedEvent]);
    const d = sync(a, principal, [event("e1", { hasAttachments: true })], LATER);
    expect([d.changed.length, d.filled?.length]).toEqual([0, 1]);
    expect(rows(a, "log").filter((r) => r.area === "calendar").map((r) => r.kind)).toEqual(["added"]);
    expect(history(a).map((h) => h.field).sort()).toEqual(["body", "hasAttachments", "kind", "outlookId"]);
    expect(byId(a, "events", idOf(a, "event", principal, "e1"))).toMatchObject({ hasAttachments: true, source: "automate" });
  });
});

describe("categories", () => {
  test("B4: a category first seen creates one record; a second sync doesn't create another", async () => {
    const { a, principal } = await setUp();
    sync(a, principal, [event("e1", { categories: "Board, Travel" }), event("e2", { categories: "board" })]);
    expect(rows(a, "categories").map((c) => [c.id, c.name, c.firstSeen, c.order])).toEqual([
      [idOf(a, "category", "board"), "Board", NOW, 0],
      [idOf(a, "category", "travel"), "Travel", NOW, 1],
    ].sort());
    sync(a, principal, [event("e1", { categories: "Board, Travel, Press", sourceModified: LATER }), event("e2", { categories: "board" })], LATER);
    expect(rows(a, "categories").map((c) => c.name).sort()).toEqual(["Board", "Press", "Travel"]);
    expect(rows(a, "categories").find((c) => c.name === "Board")?.firstSeen).toBe(NOW);
  });

  test("a masked item's categories are never recorded", async () => {
    const { a, principal } = await setUp();
    sync(a, principal, [event("e1", { masked: true, categories: "Secret" })]);
    expect(rows(a, "categories")).toEqual([]);
  });
});

describe("series records", () => {
  const weeks = ["2026-11-02T10:00:00.000Z", "2026-11-09T10:00:00.000Z", "2026-11-16T10:00:00.000Z", "2026-11-23T10:00:00.000Z"];

  test("one record per series, worked out from its occurrences", async () => {
    const { a, principal } = await setUp();
    sync(a, principal, [
      ...weeks.map((w) => occurrence("s1", w)),
      occurrence("s1", "2026-11-30T10:00:00.000Z", { kind: "exception", start: "2026-12-01T10:00:00.000Z", end: "2026-12-01T11:00:00.000Z" }),
      event("single"),
    ]);
    expect(rows(a, "series")).toEqual([expect.objectContaining({
      id: idOf(a, "series", principal, "s1"), principal, seriesId: "s1", subject: "Weekly", organizer: "Sam", pattern: "",
      firstStart: weeks[0], lastStart: "2026-12-01T10:00:00.000Z", count: 5, exceptions: 1,
    })]);
  });

  test("an occurrence gone from the middle of a series counts as an exception; one gone from the end doesn't", async () => {
    const { a, principal } = await setUp();
    sync(a, principal, weeks.map((w) => occurrence("s1", w)));
    sync(a, principal, [weeks[0], weeks[2]].map((w) => occurrence("s1", w!)), LATEST);
    expect(rows(a, "series")[0]).toMatchObject({ count: 2, exceptions: 1, firstStart: weeks[0], lastStart: weeks[2] });
  });
});

describe("series re-key (D9)", () => {
  const weeks = ["2026-11-02T10:00:00.000Z", "2026-11-09T10:00:00.000Z", "2026-11-16T10:00:00.000Z", "2026-11-23T10:00:00.000Z"];
  const shifted = weeks.map((w) => new Date(Date.parse(w) + 2 * 86_400_000 + 3_600_000).toISOString()); // Wednesdays at 11:00

  test("B6: a pattern change moves every overlay, card, task and proposal to the new occurrences", async () => {
    const { a, principal } = await setUp();
    sync(a, principal, weeks.map((w) => occurrence("s1", w)));
    const [oldId, newId] = [idOf(a, "event", principal, "s1", weeks[1]!), idOf(a, "event", principal, "s1", shifted[1]!)];
    ok(a, overlaySet, { now: NOW, event: oldId, notes: "Bring the minutes", flagged: true });
    const template = ok(a, templateSave, { now: NOW, name: "Visit", shape: "users", fields: [{ id: "host", label: "Host", type: "text" }] });
    const card = ok(a, cardAdd, { now: NOW, event: oldId, template });
    const task = ok(a, taskAdd, { now: NOW, title: "Send the papers", event: oldId, principal });
    ok(a, proposalMove, { now: NOW, event: oldId, start: "2026-11-10T15:00:00.000Z", end: "2026-11-10T16:00:00.000Z" });
    const d = sync(a, principal, shifted.map((w) => occurrence("s1", w)), LATER);
    expect(d.rekeys).toEqual([expect.objectContaining({ seriesId: "s1", ambiguous: false })]);
    expect(byId(a, "overlays", idOf(a, "overlay", newId))).toMatchObject({ event: newId, notes: "Bring the minutes", flagged: true });
    expect(byId(a, "overlays", idOf(a, "overlay", oldId))?._deleted).toBe(true);
    expect(byId(a, "cards", card)?.event).toBe(newId);
    expect(byId(a, "tasks", task)?.event).toBe(newId);
    expect(byId(a, "proposals", idOf(a, "proposal", newId))).toMatchObject({ event: newId, start: "2026-11-10T15:00:00.000Z" });
    const live = new Set(rows(a, "events").filter((e) => !e.gone).map((e) => e.id));
    const onGone = [...rows(a, "overlays"), ...rows(a, "cards"), ...rows(a, "tasks"), ...rows(a, "proposals")].filter((r) => !r._deleted && r.event && !live.has(r.event));
    expect(onGone).toEqual([]);
    const calendar = rows(a, "log").filter((r) => r.area === "calendar" && r.at === LATER).map((r) => r.kind);
    expect(calendar).toEqual(["series-rekeyed"]);
    expect(rows(a, "series")[0]).toMatchObject({ count: 4, exceptions: 0 });
  });

  test("B23: a re-keyed occurrence's proposal moves with it and isn't withdrawn as gone", async () => {
    const { a, principal } = await setUp();
    sync(a, principal, weeks.map((w) => occurrence("s1", w)));
    const [oldId, newId] = [idOf(a, "event", principal, "s1", weeks[1]!), idOf(a, "event", principal, "s1", shifted[1]!)];
    ok(a, proposalMove, { now: NOW, event: oldId, start: "2026-11-10T15:00:00.000Z", end: "2026-11-10T16:00:00.000Z" });
    sync(a, principal, shifted.map((w) => occurrence("s1", w)), LATER);
    expect(byId(a, "proposals", idOf(a, "proposal", newId))).toMatchObject({ event: newId, superseded: "" });
    expect(rows(a, "log").filter((r) => r.area === "proposal" && r.at === LATER)).toEqual([]);
  });

  test("B7: unequal counts are ambiguous: held back on a sync, listed on a manual import, and office data stays", async () => {
    const { a, principal } = await setUp();
    sync(a, principal, weeks.map((w) => occurrence("s1", w)));
    const oldId = idOf(a, "event", principal, "s1", weeks[0]!);
    ok(a, overlaySet, { now: NOW, event: oldId, notes: "Keep me" });
    const fortnightly = [shifted[0]!, shifted[2]!].map((w) => occurrence("s1", w));
    const d = diffImport(storedOf(a, principal), { events: fortnightly, ...RANGE, droppedPrivate: 0, maskedPrivate: 0, warnings: [] });
    expect(d.rekeys).toEqual([expect.objectContaining({ seriesId: "s1", ambiguous: true })]);
    expect(heldBack(d)).toContain("series changed shape");
    ok(a, importApply, { now: LATER, principal, file: "diary.ics", diff: d });
    expect(byId(a, "overlays", idOf(a, "overlay", oldId))).toMatchObject({ event: oldId, notes: "Keep me" });
    expect(rows(a, "log").some((r) => r.kind === "series-rekeyed")).toBe(false);
  });

  test("an ordinary deletion while a new occurrence joins the end of the window is not a re-key", async () => {
    const { a, principal } = await setUp();
    sync(a, principal, weeks.map((w) => occurrence("s1", w)));
    const d = sync(a, principal, [weeks[0]!, weeks[2]!, weeks[3]!, "2026-12-28T10:00:00.000Z"].map((w) => occurrence("s1", w)), LATER);
    expect(d.rekeys).toBeUndefined();
    expect(byId(a, "overlays", idOf(a, "overlay", idOf(a, "event", principal, "s1", weeks[1]!)))).toMatchObject({ archiveReason: "cancelled" });
  });
});
