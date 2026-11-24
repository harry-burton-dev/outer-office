// Compares one principal's stored events with a parsed file and says what
// applying the file would do. Pure: returns new objects, mutates nothing.
import type { EventChange, ImportDiff, ImportedEvent, StoredEvent } from "./types";
import { eventKey } from "./types";
import { fieldChanges } from "./compare";
import { findRekeys } from "./rekey";
import type { ParseResult } from "./parse-ics";

const change = (before: StoredEvent, after: ImportedEvent, fields: readonly string[]): EventChange =>
  ({ before, after, fields, moved: fields.includes("start") });

/** True when both are set and the file's version is older than the stored one. */
function isOlder(file: string, stored: string): boolean {
  if (file === "" || stored === "") return false;
  const [f, s] = [Date.parse(file), Date.parse(stored)];
  return !Number.isNaN(f) && !Number.isNaN(s) && f < s;
}

function isInRange(event: StoredEvent, rangeStart: string, rangeEnd: string): boolean {
  const start = Date.parse(event.start);
  return start >= Date.parse(rangeStart) && start <= Date.parse(rangeEnd);
}

export function diffImport(stored: readonly StoredEvent[], parsed: ParseResult): ImportDiff {
  const storedByKey = new Map(stored.map((event) => [eventKey(event), event] as const));
  const fileKeys = new Set(parsed.events.map(eventKey));
  const added: ImportedEvent[] = [];
  const changed: EventChange[] = [];
  const returned: EventChange[] = [];
  let unchanged = 0;
  let skippedOlder = 0;
  const filled: EventChange[] = [];
  for (const after of parsed.events) {
    const before = storedByKey.get(eventKey(after));
    if (!before) { added.push(after); continue; }
    const fields = fieldChanges(before, after);
    if (before.gone) returned.push(change(before, after, fields.changed));
    // Outlook moves the modified time for edits the app never reads (a reminder):
    // that alone is not a change, or the sync would apply and log one on every run.
    else if (fields.changed.length === 0 && fields.filled.length === 0) unchanged += 1;
    else if (isOlder(after.sourceModified, before.sourceModified)) skippedOlder += 1;
    else if (fields.changed.length > 0) changed.push(change(before, after, fields.changed));
    else filled.push(change(before, after, fields.filled));
  }
  const gone = stored.filter((e) => !e.gone && !fileKeys.has(eventKey(e)) && isInRange(e, parsed.rangeStart, parsed.rangeEnd));
  const rekeys = findRekeys({ added, gone });
  return {
    rangeStart: parsed.rangeStart, rangeEnd: parsed.rangeEnd, added, changed, filled, gone, returned, ...(rekeys.length > 0 && { rekeys }),
    unchanged, skippedOlder, droppedPrivate: parsed.droppedPrivate, maskedPrivate: parsed.maskedPrivate,
  };
}

/** Fewer gone than this never needs confirming, whatever the share. */
const GONE_GUARD_MIN = 3;

/**
 * True when applying would mark more than half of the stored events in the
 * range gone (and at least GONE_GUARD_MIN): what an empty, truncated or wrong
 * file looks like. The person must confirm before such a diff is applied.
 */
export function marksMostGone(diff: ImportDiff): boolean {
  // Occurrences a series re-key moves aren't lost.
  const moved = (diff.rekeys ?? []).filter((r) => !r.ambiguous).reduce((n, r) => n + r.pairs.length, 0);
  const gone = diff.gone.length - moved;
  return gone >= GONE_GUARD_MIN && gone * 2 > storedInRange(diff);
}

/** Stored events, not already gone, inside the diff's range. */
export const storedInRange = (diff: ImportDiff): number => diff.gone.length + diff.changed.length + (diff.filled?.length ?? 0) + diff.unchanged + diff.skippedOlder;
