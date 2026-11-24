// Compares one principal's stored events with a parsed file and says what
// applying the file would do. Pure: returns new objects, mutates nothing.
import type { EventChange, ImportDiff, ImportedEvent, StoredEvent } from "./types";
import { eventKey } from "./types";
import type { ParseResult } from "./parse-ics";

/** The imported fields compared, in contract order. uid and recurrenceId are the key, so always equal. */
const COMPARED_FIELDS = ["start", "end", "allDay", "subject", "location", "organizer", "categories", "showAs", "masked", "sourceModified"] as const;
const TIME_FIELDS: ReadonlySet<string> = new Set(["start", "end", "sourceModified"]);

/** Two ISO strings for the same instant are equal even if written differently. */
function sameValue(field: string, a: string | boolean, b: string | boolean): boolean {
  if (a === b) return true;
  if (!TIME_FIELDS.has(field) || typeof a !== "string" || typeof b !== "string") return false;
  const [ma, mb] = [Date.parse(a), Date.parse(b)];
  return !Number.isNaN(ma) && ma === mb;
}

const differingFields = (before: ImportedEvent, after: ImportedEvent): string[] =>
  COMPARED_FIELDS.filter((field) => !sameValue(field, before[field], after[field]));

const change = (before: StoredEvent, after: ImportedEvent): EventChange => {
  const fields = differingFields(before, after);
  return { before, after, fields, moved: fields.includes("start") };
};

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
  for (const after of parsed.events) {
    const before = storedByKey.get(eventKey(after));
    if (!before) added.push(after);
    else if (before.gone) returned.push(change(before, after));
    else if (differingFields(before, after).length === 0) unchanged += 1;
    else if (isOlder(after.sourceModified, before.sourceModified)) skippedOlder += 1;
    else changed.push(change(before, after));
  }
  const gone = stored.filter((e) => !e.gone && !fileKeys.has(eventKey(e)) && isInRange(e, parsed.rangeStart, parsed.rangeEnd));
  return {
    rangeStart: parsed.rangeStart, rangeEnd: parsed.rangeEnd, added, changed, gone, returned,
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
  const gone = diff.gone.length;
  return gone >= GONE_GUARD_MIN && gone * 2 > storedInRange(diff);
}

/** Stored events, not already gone, inside the diff's range. */
export const storedInRange = (diff: ImportDiff): number => diff.gone.length + diff.changed.length + diff.unchanged + diff.skippedOlder;
