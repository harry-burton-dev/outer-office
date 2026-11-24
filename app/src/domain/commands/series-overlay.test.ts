// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { ImportDiff, ImportedEvent } from "../../import/types";
import { importApply } from "./import";
import { principalSave } from "./office";
import { overlaySet } from "./overlay";
import { seriesOverlaySet } from "./series-overlay";
import { tagSave, tagsSet } from "./tags";
import { byId, fails, idOf, NOW, ok, oneDevice, rows, type Device } from "./testing/world";

// NOW is 2026-11-22T09:00Z. The weekly series has two past and two future occurrences.
const WEEKS = ["2026-11-08", "2026-11-15", "2026-11-29", "2026-12-06"];
const occurrence = (day: string): ImportedEvent => ({
  uid: "weekly", recurrenceId: `${day}T10:00:00Z`, seriesId: "weekly", kind: "occurrence",
  start: `${day}T10:00:00Z`, end: `${day}T11:00:00Z`, allDay: false, subject: "Weekly", location: "", organizer: "",
  categories: "", showAs: "busy", masked: false, sourceModified: "2026-11-01T09:00:00Z",
});
const diff = (added: ImportedEvent[]): ImportDiff => ({
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2027-01-01T00:00:00Z", added,
  changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0,
});

async function withSeries() {
  const a = await oneDevice();
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: diff(WEEKS.map(occurrence)) });
  const ids = WEEKS.map((day) => idOf(a, "event", principal, "weekly", `${day}T10:00:00Z`));
  const board = ok(a, tagSave, { now: NOW, name: "Board" });
  const press = ok(a, tagSave, { now: NOW, name: "Press" });
  return { a, principal, ids, board, press };
}

const overlayOf = (a: Device, event: string) => byId(a, "overlays", idOf(a, "overlay", event));

describe("seriesOverlay.set (D8)", () => {
  test("B42: a series' priority, tags and Quiet apply to its future occurrences and not its past ones; its flag doesn't apply", async () => {
    const { a, principal, ids, board } = await withSeries();
    const id = ok(a, seriesOverlaySet, { now: NOW, principal, seriesId: "weekly", tags: [board], quiet: true, priority: 2 });
    expect(id).toBe(idOf(a, "seriesOverlay", idOf(a, "series", principal, "weekly")));
    expect(byId(a, "seriesOverlays", id)).toMatchObject({ series: idOf(a, "series", principal, "weekly"), tags: board, quiet: true, priority: 2 });
    expect(overlayOf(a, ids[0])).toBeUndefined();
    expect(overlayOf(a, ids[1])).toBeUndefined();
    for (const event of ids.slice(2)) expect(overlayOf(a, event)).toMatchObject({ event, tags: board, quiet: true, priority: 2, flagged: false });
    // The series has no flag: one passed in is ignored.
    ok(a, seriesOverlaySet, { now: NOW, principal, seriesId: "weekly", flagged: true } as never);
    expect(overlayOf(a, ids[3])?.flagged).toBe(false);
    expect(byId(a, "seriesOverlays", id)).not.toHaveProperty("flagged");

    // A later import adds a future occurrence: it takes the series' values. A past one it adds does not.
    ok(a, importApply, { now: NOW, principal, file: "g.ics", diff: diff([occurrence("2026-12-13"), occurrence("2026-11-01")]) });
    expect(overlayOf(a, idOf(a, "event", principal, "weekly", "2026-12-13T10:00:00Z"))).toMatchObject({ tags: board, quiet: true, priority: 2 });
    expect(overlayOf(a, idOf(a, "event", principal, "weekly", "2026-11-01T10:00:00Z"))).toBeUndefined();
  });

  test("changing the series' tags keeps an occurrence's own tags and its other office data", async () => {
    const { a, principal, ids, board, press } = await withSeries();
    ok(a, overlaySet, { now: NOW, event: ids[2], notes: "Bring the papers", flagged: true, priority: 1 });
    ok(a, seriesOverlaySet, { now: NOW, principal, seriesId: "weekly", tags: [board] });
    expect(overlayOf(a, ids[2])).toMatchObject({ notes: "Bring the papers", flagged: true, tags: board, priority: 1 });
    // The occurrence's own tag stays when the series swaps its tags.
    const own = ok(a, tagSave, { now: NOW, name: "Own" });
    ok(a, overlaySet, { now: NOW, event: ids[3] });
    ok(a, tagsSet, { now: NOW, target: "event", id: ids[3], tags: [board, own] });
    ok(a, seriesOverlaySet, { now: NOW, principal, seriesId: "weekly", tags: [press] });
    expect(overlayOf(a, ids[2])?.tags).toBe(press);
    expect(overlayOf(a, ids[3])?.tags?.split(",").sort()).toEqual([own, press].sort());
    // Priority left out of the second call stays as the occurrence had it.
    expect(overlayOf(a, ids[2])?.priority).toBe(1);
  });

  test("turning Quiet off and priority back to none follows to future occurrences", async () => {
    const { a, principal, ids } = await withSeries();
    ok(a, seriesOverlaySet, { now: NOW, principal, seriesId: "weekly", quiet: true, priority: 3 });
    ok(a, seriesOverlaySet, { now: NOW, principal, seriesId: "weekly", quiet: false, priority: 4 });
    expect(overlayOf(a, ids[3])).toMatchObject({ quiet: false, priority: 4 });
  });

  test("a gone occurrence is left alone", async () => {
    const { a, principal, ids } = await withSeries();
    ok(a, importApply, { now: NOW, principal, file: "g.ics", diff: { ...diff([]), gone: [byId(a, "events", ids[3]) as never] } });
    ok(a, seriesOverlaySet, { now: NOW, principal, seriesId: "weekly", quiet: true });
    expect(overlayOf(a, ids[2])?.quiet).toBe(true);
    expect(overlayOf(a, ids[3])).toBeUndefined();
  });

  test("writes one log row for the series, and none when nothing changed", async () => {
    const { a, principal, board } = await withSeries();
    ok(a, seriesOverlaySet, { now: NOW, principal, seriesId: "weekly", tags: [board], quiet: true, priority: 1 });
    ok(a, seriesOverlaySet, { now: NOW, principal, seriesId: "weekly", quiet: true });
    expect(rows(a, "log").filter((r) => r.kind === "series")).toEqual([
      expect.objectContaining({ area: "overlay", principal, from: "weekly", note: "Set tags, quiet, priority P1 on 2 future occurrences" }),
    ]);
  });

  test("drops removed tags, and refuses an unknown series or a bad priority", async () => {
    const { a, principal, board } = await withSeries();
    ok(a, seriesOverlaySet, { now: NOW, principal, seriesId: "weekly", tags: [board, "no-such-tag"] });
    expect(byId(a, "seriesOverlays", idOf(a, "seriesOverlay", idOf(a, "series", principal, "weekly")))?.tags).toBe(board);
    expect(fails(a, seriesOverlaySet, { now: NOW, principal, seriesId: "nope", quiet: true })).toBe("That series hasn't arrived on this computer yet.");
    expect(fails(a, seriesOverlaySet, { now: NOW, principal, seriesId: "weekly", priority: 5 })).toBe("Priority must be 1, 2, 3 or 4.");
  });
});
