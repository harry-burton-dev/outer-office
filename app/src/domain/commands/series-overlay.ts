// seriesOverlay.set: the office's tags, Quiet and priority on a whole series
// (D8). They apply to the series' future occurrences, and to occurrences a
// later import adds. Past occurrences keep what they had. The flag is not a
// series field.
import { defineCommand, type Tx } from "@trellis/framework";
import { tagIdsOf } from "../tags";
import { overlayId } from "./overlay";
import { defined, optionalBoolean, optionalNumber, requireNow, requireText, writeLog } from "./shared";

export interface SeriesOverlaySetInput {
  now: string;
  /** The principal id. */
  principal: string;
  /** The series UID (events.seriesId). */
  seriesId: string;
  /** Tag ids; replaces the series' tags. */
  tags?: readonly string[];
  quiet?: boolean;
  /** 1 to 4, the task scale; 4 is none set (D14). */
  priority?: number;
}

/** What a series carries for its occurrences. */
export interface SeriesValues { tags: string; quiet: boolean; priority: number }

export const NO_SERIES_VALUES: SeriesValues = { tags: "", quiet: false, priority: 4 };

export const seriesRecordId = (tx: Tx, principal: string, seriesId: string): string => tx.id("series", principal, seriesId);
export const seriesOverlayId = (tx: Tx, principal: string, seriesId: string): string => tx.id("seriesOverlay", seriesRecordId(tx, principal, seriesId));

/**
 * Moves one occurrence's overlay from the series' old values to its new ones.
 * Tags the series dropped come off and tags it gained go on; the occurrence's
 * own other tags stay. Quiet and priority follow the series when the series
 * changed them. Returns true when the overlay changed.
 */
export function applySeriesValues(tx: Tx, eventId: string, before: SeriesValues, after: SeriesValues): boolean {
  const id = overlayId(tx, eventId);
  const current = tx.get("overlays", id);
  const live = current && !current._deleted ? current : undefined;
  const dropped = new Set(tagIdsOf(before.tags).filter((t) => !tagIdsOf(after.tags).includes(t)));
  const own = tagIdsOf(live?.tags);
  const tags = [...new Set([...own.filter((t) => !dropped.has(t)), ...tagIdsOf(after.tags)])].join(",");
  const quiet = after.quiet !== before.quiet ? after.quiet : (live?.quiet ?? false);
  const priority = after.priority !== before.priority ? after.priority : (live?.priority ?? 4);
  if (live && tags === (live.tags ?? "") && quiet === (live.quiet ?? false) && priority === (live.priority ?? 4)) return false;
  if (!live && tags === "" && !quiet && priority === 4) return false;
  if (current?._deleted) tx.restore("overlays", id);
  tx.put("overlays", id, live ? { tags, quiet, priority } : { prep: "none", flagged: false, parent: "", event: eventId, tags, quiet, priority });
  return true;
}

function checkTags(tx: Tx, tags: unknown): string | undefined {
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) tx.fail("The tags must be a list.");
  const live = new Set(tx.list("tags").map((t) => t.id));
  return [...new Set(tags as string[])].filter((t) => live.has(t)).join(",");
}

function checkPriority(tx: Tx, priority: unknown): number | undefined {
  const value = optionalNumber(tx, priority, "The priority");
  if (value !== undefined && ![1, 2, 3, 4].includes(value)) tx.fail("Priority must be 1, 2, 3 or 4.");
  return value;
}

/** Sets the series' values and applies them to every occurrence that starts at or after now. Returns the series overlay id. */
export const seriesOverlaySet = defineCommand("seriesOverlay.set", (tx: Tx, input: SeriesOverlaySetInput) => {
  const now = requireNow(tx, input);
  const principal = requireText(tx, input.principal, "The principal");
  const seriesId = requireText(tx, input.seriesId, "The series");
  const record = seriesRecordId(tx, principal, seriesId);
  const series = tx.get("series", record);
  if (!series || series._deleted) tx.fail("That series hasn't arrived on this computer yet.");
  const fields = defined({
    tags: checkTags(tx, input.tags),
    quiet: optionalBoolean(tx, input.quiet, "Quiet"),
    priority: checkPriority(tx, input.priority),
  });
  const id = seriesOverlayId(tx, principal, seriesId);
  const current = tx.get("seriesOverlays", id);
  const live = current && !current._deleted ? current : undefined;
  const before: SeriesValues = { tags: live?.tags ?? "", quiet: live?.quiet ?? false, priority: live?.priority ?? 4 };
  const after: SeriesValues = { ...before, ...fields };
  if (current?._deleted) tx.restore("seriesOverlays", id);
  tx.put("seriesOverlays", id, live ? fields : { ...after, series: record });
  const future = tx.list("events").filter((e) => e.principal === principal && e.seriesId === seriesId && e.gone !== true && (e.start ?? "") >= now);
  const changed = future.filter((e) => applySeriesValues(tx, e.id, before, after)).length;
  const what = [
    after.tags !== before.tags && "tags", after.quiet !== before.quiet && (after.quiet ? "quiet" : "not quiet"),
    after.priority !== before.priority && `priority ${after.priority === 4 ? "none" : `P${after.priority}`}`,
  ].filter(Boolean);
  if (what.length > 0) {
    writeLog(tx, now, { area: "overlay", kind: "series", principal, from: seriesId, note: `Set ${what.join(", ")} on ${changed} future occurrence${changed === 1 ? "" : "s"}` });
  }
  return id;
});
