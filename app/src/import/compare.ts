// Which fields of a stored event an incoming one changes. Shared by the diff
// (what the review shows) and import.apply (what it writes), so both agree.
// Pure.
import type { EventSource, ImportedEvent } from "./types";

/** Fields added by events v3 (OUT-83). A row stored before v3, or by a source that doesn't carry one, has only its default. */
export const V3_FIELDS = [
  "kind", "seriesId", "outlookId", "attendees", "organizerAddress", "locationType", "online", "onlineProvider", "joinUrl",
  "hasAttachments", "webLink", "response", "isOrganizer", "responseRequested", "allowNewTimeProposals", "body",
] as const;

/** Every field compared and written, in contract order. `source` and `raw` describe the item rather than the meeting, so they are written but never compared. */
export const COMPARED_FIELDS = [
  "start", "end", "allDay", "subject", "location", "organizer", "categories", "showAs", "masked",
  "requiredAttendees", "optionalAttendees", "importance", "sensitivity", ...V3_FIELDS,
] as const;

export type ComparedField = (typeof COMPARED_FIELDS)[number];
type V3Field = (typeof V3_FIELDS)[number];

/** The v3 fields each source carries. The sync carries them all. */
const CARRIED: Readonly<Record<EventSource, ReadonlySet<V3Field>>> = {
  automate: new Set(V3_FIELDS),
  ics: new Set(["kind", "seriesId", "attendees", "organizerAddress", "body"]),
  csv: new Set(["kind", "seriesId", "body"]),
};

const BOOLEAN_FIELDS: ReadonlySet<string> = new Set(["allDay", "masked", "online", "hasAttachments", "isOrganizer", "responseRequested", "allowNewTimeProposals"]);
const TIME_FIELDS: ReadonlySet<string> = new Set(["start", "end"]);
const V3: ReadonlySet<string> = new Set(V3_FIELDS);
/** Fields the sync only carries from v3: a value where "" was stored is filled in, not changed. */
const FILL_WHEN_EMPTY: ReadonlySet<string> = new Set(["importance", "sensitivity"]);

/** A field's value with its default filled in, so a missing one compares as empty. */
export const valueOf = (event: Partial<ImportedEvent>, field: ComparedField): string | boolean =>
  event[field] ?? (BOOLEAN_FIELDS.has(field) ? false : "");

/** Two ISO strings for the same instant are equal even if written differently. */
function same(field: string, a: string | boolean, b: string | boolean): boolean {
  if (a === b) return true;
  if (!TIME_FIELDS.has(field) || typeof a !== "string" || typeof b !== "string") return false;
  const [ma, mb] = [Date.parse(a), Date.parse(b)];
  return !Number.isNaN(ma) && ma === mb;
}

export interface FieldChanges {
  /** Fields whose meeting value changed. */
  changed: ComparedField[];
  /**
   * v3 fields the stored row never had, because it was stored before v3 or
   * by a source that doesn't carry them. Writing them is not a change to the
   * meeting, so the first sync after the flow is widened doesn't report every
   * engagement as changed.
   */
  filled: ComparedField[];
}

export function fieldChanges(stored: Partial<ImportedEvent>, incoming: ImportedEvent): FieldChanges {
  const changed: ComparedField[] = [];
  const filled: ComparedField[] = [];
  const carried = stored.source ? CARRIED[stored.source] : undefined;
  for (const field of COMPARED_FIELDS) {
    // A field the source does not carry is not a change.
    if (incoming[field] === undefined || same(field, valueOf(stored, field), valueOf(incoming, field))) continue;
    const never = V3.has(field) ? !carried?.has(field as V3Field) : FILL_WHEN_EMPTY.has(field) && valueOf(stored, field) === "";
    if (never) filled.push(field);
    else changed.push(field);
  }
  return { changed, filled };
}

/** History doesn't repeat the attendee text lines, which are written from `attendees`. */
export const HISTORY_SKIPS: ReadonlySet<string> = new Set(["requiredAttendees", "optionalAttendees"]);
