// The contract between the .ics parser, the diff and the import.apply command.
// Times are ISO 8601 UTC strings. An all-day event's start and end are the
// UTC instants of local midnight in the office time zone.

/** One occurrence read from an .ics file, after the private policy is applied. */
export interface ImportedEvent {
  uid: string;
  /** Empty for a single event; the occurrence's original start (ISO UTC) for one instance of a series. */
  recurrenceId: string;
  start: string;
  end: string;
  allDay: boolean;
  subject: string;
  location: string;
  organizer: string;
  /** Outlook categories, comma separated. */
  categories: string;
  /** busy | tentative | free | oof */
  showAs: string;
  /** True when the private policy replaced its details. */
  masked: boolean;
  /** LAST-MODIFIED, or DTSTAMP when absent, as ISO UTC. */
  sourceModified: string;
  // Optional: a source may not carry them (CSV has no responses, masked items none).
  /** One attendee per line: "Name <address> · response". Required and optional, as in Outlook. */
  requiredAttendees?: string;
  optionalAttendees?: string;
  /** low | normal | high */
  importance?: string;
  /** normal | private | confidential */
  sensitivity?: string;
  /** CREATED, as ISO UTC. */
  created?: string;
  // events v3 (OUT-83, v0.3-brief.md section 3). Optional because a source
  // may not carry one; a field left out keeps what an earlier import stored.
  /** Where it came from: automate (the sync), ics or csv. */
  source?: EventSource;
  /** single, occurrence or exception. */
  kind?: EventKind;
  /** The series UID: `uid` for an occurrence or exception, "" for a single event. */
  seriesId?: string;
  /** Graph's id; "" from a file. */
  outlookId?: string;
  /** JSON [{ name, address, type: required|optional|resource, response, respondedAt }]. */
  attendees?: string;
  organizerAddress?: string;
  locationType?: string;
  online?: boolean;
  onlineProvider?: string;
  joinUrl?: string;
  hasAttachments?: boolean;
  webLink?: string;
  /** The principal's own response: accepted, tentative, declined, no response, organizer, or "". */
  response?: string;
  isOrganizer?: boolean;
  responseRequested?: boolean;
  allowNewTimeProposals?: boolean;
  /** Plain text, never HTML. "" for masked items (D7). */
  body?: string;
  /** The item as received: Graph JSON, the VEVENT lines, or the CSV row as JSON. "" for masked items. */
  raw?: string;
}

export type EventSource = "automate" | "ics" | "csv";
export type EventKind = "single" | "occurrence" | "exception";

/** One attendee in `attendees`. */
export interface Attendee {
  name: string;
  address: string;
  type: "required" | "optional" | "resource";
  response: string;
  respondedAt: string;
}

/** An event as stored in the `events` table. */
export interface StoredEvent extends ImportedEvent {
  id: string;
  principal: string;
  gone: boolean;
  moves: number;
}

/** A stored event and what the file now says about it. */
export interface EventChange {
  before: StoredEvent;
  after: ImportedEvent;
  /** Names of the fields that differ. */
  fields: readonly string[];
  /** True when the start differs. */
  moved: boolean;
}

/** What applying a file would do, for a person to confirm. */
export interface ImportDiff {
  /** The span the file covers, ISO UTC. Stored events outside it are left alone. */
  rangeStart: string;
  rangeEnd: string;
  added: readonly ImportedEvent[];
  changed: readonly EventChange[];
  /** Fields the stored event never had, now filled in (see import/compare.ts). Not a change to the meeting. Left out means none. */
  filled?: readonly EventChange[];
  /** Stored, not gone, inside the range, and absent from the file. */
  gone: readonly StoredEvent[];
  /** Stored as gone, and present in the file again. */
  returned: readonly EventChange[];
  /** Series whose occurrences this diff re-keys (import/rekey.ts). Left out means none. */
  rekeys?: readonly import("./rekey").SeriesRekey[];
  unchanged: number;
  /** In the file, but older than what is stored. */
  skippedOlder: number;
  droppedPrivate: number;
  maskedPrivate: number;
}

/** Identifies one occurrence within one principal's diary. */
export const eventKey = (event: Pick<ImportedEvent, "uid" | "recurrenceId">): string => `${event.uid}\n${event.recurrenceId}`;
