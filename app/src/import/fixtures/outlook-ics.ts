// Synthetic .ics test data shaped like Outlook's "Save Calendar" output:
// Microsoft PRODID, a "GMT Standard Time" VTIMEZONE with both UK clock-change
// rules, X-MICROSOFT-CDO-BUSYSTATUS, lines folded at 75 octets, CRLF endings.
// Every name, title and address here is made up.

const CRLF = "\r\n";
const FOLD_AT = 75;

/** Folds one content line the way RFC 5545 (and Outlook) does: 75 octets, then CRLF + space. */
export function foldLine(line: string): string {
  if (line.length <= FOLD_AT) return line;
  const parts = [line.slice(0, FOLD_AT)];
  for (let i = FOLD_AT; i < line.length; i += FOLD_AT - 1) parts.push(" " + line.slice(i, i + FOLD_AT - 1));
  return parts.join(CRLF);
}

export const LONDON_TZID = "GMT Standard Time";

export const LONDON_VTIMEZONE: readonly string[] = [
  "BEGIN:VTIMEZONE",
  `TZID:${LONDON_TZID}`,
  "BEGIN:STANDARD",
  "DTSTART:16011028T020000",
  "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:-0000",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:16010325T010000",
  "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
  "TZOFFSETFROM:-0000",
  "TZOFFSETTO:+0100",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
];

/** A synthetic Outlook-style UID (Outlook uses long hex global object ids). */
export const outlookUid = (n: number): string =>
  `040000008200E00074C5B7101A82E00800000000${String(n).padStart(4, "0")}A1B2C3D4E5F601000000000000000010000000${String(n).padStart(8, "0")}`;

/** The properties every Outlook VEVENT carries, before the event's own. */
const outlookDefaults = (uid: string): readonly string[] => [
  "CLASS:PUBLIC",
  "CREATED:20260901T100000Z",
  "DTSTAMP:20261101T120000Z",
  "LAST-MODIFIED:20260915T100000Z",
  "PRIORITY:5",
  "SEQUENCE:0",
  `UID:${uid}`,
  "LANGUAGE:en-gb",
];

/** Builds one VEVENT. Later lines with the same property name replace the defaults. */
export function vevent(uid: string, lines: readonly string[], withDefaults = true): readonly string[] {
  const own = new Set(lines.map((line) => line.split(/[;:]/)[0]));
  const defaults = withDefaults ? outlookDefaults(uid).filter((line) => !own.has(line.split(/[;:]/)[0])) : [];
  return ["BEGIN:VEVENT", ...defaults, ...lines, "END:VEVENT"];
}

/** Wraps VEVENTs into a VCALENDAR with the London VTIMEZONE, folded, CRLF separated. */
export function calendar(events: readonly (readonly string[])[], withTimezone = true): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN",
    "VERSION:2.0",
    "METHOD:PUBLISH",
    "X-CALSTART:20261012T000000Z",
    "X-CALEND:20261109T000000Z",
    "X-WR-CALNAME:Calendar",
    ...(withTimezone ? LONDON_VTIMEZONE : []),
    ...events.flat(),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join(CRLF) + CRLF;
}

const tz = (prop: string, value: string): string => `${prop};TZID=${LONDON_TZID}:${value}`;
const busy = ["TRANSP:OPAQUE", "X-MICROSOFT-CDO-BUSYSTATUS:BUSY"];

export const UID = {
  weeklyReview: outlookUid(1),
  standUp: outlookUid(2),
  projectSync: outlookUid(3),
  officeClosed: outlookUid(4),
  conference: outlookUid(5),
  personal: outlookUid(6),
  supplierCall: outlookUid(7),
  remoteTeam: outlookUid(8),
  lunch: outlookUid(9),
  reminder: outlookUid(10),
  workshop: outlookUid(11),
  beforeWindow: outlookUid(12),
  afterWindow: outlookUid(13),
} as const;

export const WORKSHOP_SUBJECT =
  "Quarterly planning workshop for the operations group, including the budget review and agreed next steps";

/** The main fixture: 12 October to 8 November 2026, Europe/London. */
export const MAIN_EVENTS: readonly (readonly string[])[] = [
  // Weekly on Mondays 09:00-10:00 local, 8 times from 5 Oct: spans the 25 Oct clock change and both window ends.
  vevent(UID.weeklyReview, ["SUMMARY:Weekly review", tz("DTSTART", "20261005T090000"), tz("DTEND", "20261005T100000"),
    "RRULE:FREQ=WEEKLY;COUNT=8;BYDAY=MO", "LOCATION:Room 1", "ORGANIZER;CN=\"Alex Example\":mailto:alex@example.invalid", ...busy]),
  // Weekdays 08:30-08:45 local, 12-23 Oct, with 14 Oct excluded and 21 Oct cancelled below.
  vevent(UID.standUp, ["SUMMARY:Daily stand-up", tz("DTSTART", "20261012T083000"), tz("DTEND", "20261012T084500"),
    "RRULE:FREQ=WEEKLY;UNTIL=20261023T073000Z;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;WKST=MO", tz("EXDATE", "20261014T083000"), ...busy]),
  vevent(UID.standUp, ["SUMMARY:Daily stand-up", tz("RECURRENCE-ID", "20261021T083000"), tz("DTSTART", "20261021T083000"),
    tz("DTEND", "20261021T084500"), "STATUS:CANCELLED", "LAST-MODIFIED:20261001T090000Z", ...busy]),
  // Thursdays 14:00-15:00 local, 4 times from 15 Oct; the 22 Oct one moves to Friday 23 Oct 11:00-12:00.
  vevent(UID.projectSync, ["SUMMARY:Project sync", tz("DTSTART", "20261015T140000"), tz("DTEND", "20261015T150000"),
    "RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=TH", "CATEGORIES:Projects,Internal", ...busy]),
  vevent(UID.projectSync, ["SUMMARY:Project sync", tz("RECURRENCE-ID", "20261022T140000"), tz("DTSTART", "20261023T110000"),
    tz("DTEND", "20261023T120000"), "CATEGORIES:Projects,Internal", "LAST-MODIFIED:20261010T090000Z", ...busy]),
  vevent(UID.officeClosed, ["SUMMARY:Office closed", "DTSTART;VALUE=DATE:20261016", "DTEND;VALUE=DATE:20261017",
    "TRANSP:TRANSPARENT", "X-MICROSOFT-CDO-BUSYSTATUS:FREE", "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE"]),
  vevent(UID.conference, ["SUMMARY:Sector conference", "DTSTART;VALUE=DATE:20261023", "DTEND;VALUE=DATE:20261027",
    "LOCATION:Conference centre", "TRANSP:OPAQUE", "X-MICROSOFT-CDO-BUSYSTATUS:OOF", "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE"]),
  vevent(UID.personal, ["SUMMARY:Personal appointment", "CLASS:PRIVATE", tz("DTSTART", "20261103T100000"),
    tz("DTEND", "20261103T110000"), "LOCATION:Somewhere private", "CATEGORIES:Personal", ...busy]),
  vevent(UID.supplierCall, ["SUMMARY:Supplier call", "STATUS:CANCELLED", tz("DTSTART", "20261020T150000"),
    tz("DTEND", "20261020T153000"), ...busy]),
  vevent(UID.remoteTeam, ["SUMMARY:Call with remote team", "DTSTART:20261028T160000Z", "DTEND:20261028T163000Z", ...busy]),
  vevent(UID.lunch, ["SUMMARY:Team lunch", "DTSTART:20261013T120000", "DTEND:20261013T130000", ...busy]),
  vevent(UID.reminder, ["SUMMARY:Submit monthly report", tz("DTSTART", "20261104T170000"), "TRANSP:TRANSPARENT"]),
  vevent(UID.workshop, [`SUMMARY:${WORKSHOP_SUBJECT}`, tz("DTSTART", "20261106T130000"), tz("DTEND", "20261106T160000"),
    "LOCATION:Board room", "ORGANIZER:mailto:organiser@example.invalid", "TRANSP:OPAQUE",
    "X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE", "LAST-MODIFIED:20261020T083000Z"]),
  vevent(UID.beforeWindow, ["SUMMARY:Earlier meeting", tz("DTSTART", "20261001T100000"), tz("DTEND", "20261001T110000"), ...busy]),
  vevent(UID.afterWindow, ["SUMMARY:Later meeting", tz("DTSTART", "20261120T100000"), tz("DTEND", "20261120T110000"), ...busy]),
];

export const MAIN_FIXTURE = calendar(MAIN_EVENTS);

/** The window the main fixture is read with: local midnight 12 Oct to local midnight 9 Nov, Europe/London. */
export const MAIN_WINDOW = {
  timeZone: "Europe/London",
  windowStart: "2026-10-11T23:00:00.000Z",
  windowEnd: "2026-11-09T00:00:00.000Z",
} as const;
