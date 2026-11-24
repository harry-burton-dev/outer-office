// Series re-key (OUT-83, v0.3-brief.md section 4, D9). When Outlook changes a
// series' pattern, every occurrence gets a new original start, so an import
// sees the old occurrences gone and new ones added. Within one series those
// two sets are paired by order of start. Pure.
import type { ImportDiff, ImportedEvent, StoredEvent } from "./types";

/** A pair further apart than this isn't the same meeting moved by a pattern change. */
const MAX_SHIFT_MS = 7 * 86_400_000;

export interface RekeyPair {
  from: StoredEvent;
  to: ImportedEvent;
}

export interface SeriesRekey {
  seriesId: string;
  subject: string;
  pairs: readonly RekeyPair[];
  /**
   * True when the pairing can't be trusted: the counts differ, or a pair is
   * a week or more apart. A sync holds such an import back; a manual import
   * lists it, and leaves office data where it is.
   */
  ambiguous: boolean;
}

const byStart = <T extends { start: string }>(list: T[]): T[] => list.sort((a, b) => a.start.localeCompare(b.start));

function groupBySeries<T extends { seriesId?: string; recurrenceId: string; start: string }>(list: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const e of list) {
    if (!e.seriesId || e.recurrenceId === "") continue;
    groups.set(e.seriesId, [...(groups.get(e.seriesId) ?? []), e]);
  }
  return groups;
}

/** The items of `list` that start within a week of the span of `other`. */
function near<T extends { start: string }>(list: readonly T[], other: readonly { start: string }[]): T[] {
  const starts = other.map((e) => Date.parse(e.start));
  const [first, last] = [Math.min(...starts) - MAX_SHIFT_MS, Math.max(...starts) + MAX_SHIFT_MS];
  return list.filter((e) => Date.parse(e.start) > first && Date.parse(e.start) < last);
}

/**
 * Each series where this diff marks occurrences gone and adds others near
 * them. An occurrence that only joins the end of the window as days pass is
 * not near a gone one, so an ordinary deletion is never read as a re-key.
 */
export function findRekeys(diff: Pick<ImportDiff, "added" | "gone">): SeriesRekey[] {
  const gone = groupBySeries(diff.gone);
  const added = groupBySeries(diff.added);
  const rekeys: SeriesRekey[] = [];
  for (const [seriesId, olds] of gone) {
    const news = added.get(seriesId);
    if (!news) continue;
    const [from, to] = [byStart(near(olds, news)), byStart(near(news, olds))];
    if (from.length === 0 || to.length === 0) continue;
    const pairs = from.slice(0, to.length).map((f, i) => ({ from: f, to: to[i]! }));
    const far = pairs.some((p) => Math.abs(Date.parse(p.to.start) - Date.parse(p.from.start)) >= MAX_SHIFT_MS);
    rekeys.push({ seriesId, subject: to[0]?.subject ?? from[0]?.subject ?? "", pairs, ambiguous: from.length !== to.length || far });
  }
  return rekeys.sort((a, b) => a.seriesId.localeCompare(b.seriesId));
}

/** The reason a sync is held back when a series changed in a way it can't pair. */
export const SHAPE_REASON = "series changed shape";
