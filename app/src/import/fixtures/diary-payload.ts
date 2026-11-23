// Synthetic diary payload: the same diary as the main .ics fixture
// (outlook-ics.ts), shaped as flow F1 returns it from Graph's calendarView
// with Prefer: outlook.timezone="UTC". Occurrences carry their own iCalUId,
// as Graph's do; only the masters list links them to the .ics UID.
// Replace with the scrubbed real capture (spike S1 and S6) once it exists.
import type { DiaryEvent, DiaryPayload } from "../parse-automate";
import { MAIN_WINDOW, UID, WORKSHOP_SUBJECT } from "./outlook-ics";

/** Graph's dateTime form: no zone designator, seven decimals. */
const g = (date: string): string => `2026-${date}:00.0000000`;

const base = {
  type: "singleInstance", seriesMasterId: null, originalStart: null, timeZone: "UTC", isAllDay: false, isCancelled: false,
  location: null, organizer: null, categories: [], showAs: "busy", sensitivity: "normal",
  lastModifiedDateTime: "2026-09-15T10:00:00.1234567Z", attendees: [],
} as const;

export const MASTER_ID = { weeklyReview: "AAMkAD-master-1", standUp: "AAMkAD-master-2", projectSync: "AAMkAD-master-3" } as const;

const single = (uid: string, start: string, end: string, extra: Partial<DiaryEvent> = {}): DiaryEvent =>
  ({ ...base, iCalUId: uid, start: g(start), end: g(end), subject: "", ...extra });

let occurrenceNumber = 0;
/** An occurrence of a series: its own per-occurrence iCalUId, the master's id, and its original start. */
export const occurrence = (master: string, original: string, start: string, end: string, extra: Partial<DiaryEvent> = {}): DiaryEvent => ({
  ...base, iCalUId: `occ-${++occurrenceNumber}`, type: "occurrence", seriesMasterId: master,
  originalStart: `2026-${original}:00Z`, start: g(start), end: g(end), subject: "", ...extra,
});

const review = { subject: "Weekly review", location: "Room 1", organizer: "Alex Example" };
const standUp = { subject: "Daily stand-up" };
const sync = { subject: "Project sync", categories: ["Projects", "Internal"] };

export const MAIN_PAYLOAD_EVENTS: readonly DiaryEvent[] = [
  // 09:00 London: 08:00Z before the 25 October clock change, 09:00Z after it.
  ...[["10-12T08:00", "10-12T09:00"], ["10-19T08:00", "10-19T09:00"], ["10-26T09:00", "10-26T10:00"], ["11-02T09:00", "11-02T10:00"]]
    .map(([s, e]) => occurrence(MASTER_ID.weeklyReview, s ?? "", s ?? "", e ?? "", review)),
  // 14 Oct is excluded and 21 Oct cancelled, so Graph's calendarView doesn't return them.
  ...["10-12", "10-13", "10-15", "10-16", "10-19", "10-20", "10-22", "10-23"].map((d) =>
    occurrence(MASTER_ID.standUp, `${d}T07:30`, `${d}T07:30`, `${d}T07:45`, standUp)),
  occurrence(MASTER_ID.projectSync, "10-15T13:00", "10-15T13:00", "10-15T14:00", sync),
  occurrence(MASTER_ID.projectSync, "10-22T13:00", "10-23T10:00", "10-23T11:00",
    { ...sync, type: "exception", lastModifiedDateTime: "2026-10-10T09:00:00.5550000Z" }),
  occurrence(MASTER_ID.projectSync, "10-29T14:00", "10-29T14:00", "10-29T15:00", sync),
  occurrence(MASTER_ID.projectSync, "11-05T14:00", "11-05T14:00", "11-05T15:00", sync),
  single(UID.officeClosed, "10-16T00:00", "10-17T00:00", { subject: "Office closed", isAllDay: true, showAs: "free" }),
  single(UID.conference, "10-23T00:00", "10-27T00:00", { subject: "Sector conference", isAllDay: true, showAs: "oof", location: "Conference centre" }),
  // Flow F1 has already masked it: subject "Private", nothing identifying.
  single(UID.personal, "11-03T10:00", "11-03T11:00", { subject: "Private", sensitivity: "private" }),
  single(UID.supplierCall, "10-20T14:00", "10-20T14:30", { subject: "Supplier call", isCancelled: true }),
  single(UID.remoteTeam, "10-28T16:00", "10-28T16:30", { subject: "Call with remote team" }),
  single(UID.lunch, "10-13T11:00", "10-13T12:00", { subject: "Team lunch" }),
  single(UID.reminder, "11-04T17:00", "11-04T17:00", { subject: "Submit monthly report", showAs: "free" }),
  single(UID.workshop, "11-06T13:00", "11-06T16:00", {
    subject: WORKSHOP_SUBJECT, location: "Board room", organizer: "organiser@example.invalid", showAs: "tentative",
    lastModifiedDateTime: "2026-10-20T08:30:00.4410000Z",
  }),
];

export const MAIN_PAYLOAD: DiaryPayload = {
  principal: "PRINCIPAL-A",
  windowStart: MAIN_WINDOW.windowStart,
  windowEnd: MAIN_WINDOW.windowEnd,
  count: MAIN_PAYLOAD_EVENTS.length,
  masters: [
    { id: MASTER_ID.weeklyReview, iCalUId: UID.weeklyReview },
    { id: MASTER_ID.standUp, iCalUId: UID.standUp },
    { id: MASTER_ID.projectSync, iCalUId: UID.projectSync },
  ],
  events: MAIN_PAYLOAD_EVENTS,
};
