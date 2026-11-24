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
  /** Stored, not gone, inside the range, and absent from the file. */
  gone: readonly StoredEvent[];
  /** Stored as gone, and present in the file again. */
  returned: readonly EventChange[];
  unchanged: number;
  /** In the file, but older than what is stored. */
  skippedOlder: number;
  droppedPrivate: number;
  maskedPrivate: number;
}

/** Identifies one occurrence within one principal's diary. */
export const eventKey = (event: Pick<ImportedEvent, "uid" | "recurrenceId">): string => `${event.uid}\n${event.recurrenceId}`;
