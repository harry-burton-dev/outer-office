// Synthetic diaries for designing in the dev server: three made-up principals,
// eight weeks around a given Monday, shaped like Outlook's .ics export.
// Each principal's diary has a second "update" file with moves, cancellations
// and new meetings, so an import shows a real diff. Every name, title and place
// here is made up. Varied on purpose so lenses have something to show:
// seniority (categories), location (in person, video, travel), freshness
// (LAST-MODIFIED), attendees and their responses, private items, all-day items.
import { calendar, LONDON_TZID, outlookUid, vevent } from "../fixtures/outlook-ics.ts";

export interface DiaryFile {
  fileName: string;
  text: string;
}

interface Template {
  subject: string;
  /** Seniority, read by a seniority lens. */
  category: "Ministerial" | "Board" | "External" | "Stakeholder" | "Internal" | "Personal";
  location: string;
  minutes: number;
  attendees: readonly string[];
}

const PEOPLE = [
  "Avery Stone", "Blake Moreno", "Casey Lund", "Devon Hale", "Ellis Marsh", "Frankie Doyle", "Gray Patel",
  "Harper Quinn", "Indy Shaw", "Jordan Reyes", "Kai Brennan", "Logan Achebe", "Morgan Tate", "Noel Varga",
];
const VIDEO = "Microsoft Teams Meeting";

const TEMPLATES: readonly Template[] = [
  { subject: "Ministerial bilateral", category: "Ministerial", location: "Admiralty House", minutes: 60, attendees: PEOPLE.slice(0, 4) },
  { subject: "Select committee prep", category: "Ministerial", location: "Room 4.12", minutes: 90, attendees: PEOPLE.slice(2, 6) },
  { subject: "Board meeting", category: "Board", location: "Board room", minutes: 120, attendees: PEOPLE.slice(0, 8) },
  { subject: "Audit and risk committee", category: "Board", location: "Board room", minutes: 90, attendees: PEOPLE.slice(4, 9) },
  { subject: "Investor call", category: "External", location: VIDEO, minutes: 45, attendees: PEOPLE.slice(6, 8) },
  { subject: "Visit: regional office", category: "External", location: "Leeds regional office", minutes: 240, attendees: PEOPLE.slice(8, 11) },
  { subject: "Lunch with sector leads", category: "Stakeholder", location: "The Granary, Kings Cross", minutes: 90, attendees: PEOPLE.slice(9, 13) },
  { subject: "Roundtable: skills", category: "Stakeholder", location: "Conference suite B", minutes: 120, attendees: PEOPLE.slice(3, 12) },
  { subject: "Media interview", category: "External", location: "Broadcast studio, Millbank", minutes: 30, attendees: PEOPLE.slice(12, 13) },
  { subject: "Strategy deep dive", category: "Internal", location: "Room 2.01", minutes: 90, attendees: PEOPLE.slice(1, 5) },
  { subject: "Budget check-in", category: "Internal", location: VIDEO, minutes: 30, attendees: PEOPLE.slice(5, 7) },
  { subject: "1:1", category: "Internal", location: "Office", minutes: 30, attendees: PEOPLE.slice(10, 11) },
  { subject: "Speech rehearsal", category: "Internal", location: "Room 2.01", minutes: 45, attendees: PEOPLE.slice(0, 2) },
];

interface Principal {
  code: string;
  name: string;
  seed: number;
  /** Rough meetings per working day. */
  density: number;
  weekly: readonly Weekly[];
}

/**
 * A weekly series of 8. plant "exceptions": week 2 moves an hour later
 * (a RECURRENCE-ID override) in both files, and the update file cancels
 * week 6 (an EXDATE). plant "rekey": the update file moves the whole series
 * half an hour later, so its occurrences are re-keyed (OUT-83, B6).
 */
interface Weekly {
  subject: string; day: number; at: string; minutes: number; category: Template["category"]; location: string;
  plant?: "exceptions" | "rekey";
}

const SERIES_WEEKS = 8;
const MOVED_WEEK = 1;
const CANCELLED_WEEK = 5;

const PRINCIPALS: readonly Principal[] = [
  {
    code: "PRINCIPAL-A", name: "Chief Executive", seed: 11, density: 4,
    weekly: [
      { subject: "Executive team", day: 0, at: "0900", minutes: 60, category: "Internal", location: "Board room" },
      // Overlaps Executive team every week: a standing clash (OUT-87, B9).
      { subject: "Operations review", day: 0, at: "0930", minutes: 60, category: "Internal", location: "Room 2.01" },
      { subject: "Diary meeting", day: 4, at: "1600", minutes: 30, category: "Internal", location: "Office", plant: "exceptions" },
    ],
  },
  {
    code: "PRINCIPAL-B", name: "Chair", seed: 23, density: 2,
    weekly: [{ subject: "Chair and CEO catch-up", day: 2, at: "0830", minutes: 45, category: "Board", location: "Office", plant: "exceptions" }],
  },
  {
    code: "PRINCIPAL-C", name: "Director of Policy", seed: 37, density: 5,
    weekly: [
      { subject: "Policy stand-up", day: 0, at: "0930", minutes: 15, category: "Internal", location: VIDEO, plant: "exceptions" },
      { subject: "Policy stand-up", day: 3, at: "0930", minutes: 15, category: "Internal", location: VIDEO, plant: "rekey" },
    ],
  },
];

const PARTSTATS = ["ACCEPTED", "ACCEPTED", "ACCEPTED", "TENTATIVE", "DECLINED", "NEEDS-ACTION"] as const;
const SLOTS = ["0830", "0930", "1030", "1130", "1300", "1400", "1500", "1600", "1700"];

/** A small seeded random number generator, so the same anchor gives the same diaries. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const pad = (n: number): string => String(n).padStart(2, "0");
const ymd = (d: Date): string => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);
const stamp = (d: Date): string => `${ymd(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const localTime = (day: Date, hhmm: string, plusMinutes = 0): string => {
  const total = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2)) + plusMinutes;
  return `${ymd(addDays(day, Math.floor(total / 1440)))}T${pad(Math.floor(total / 60) % 24)}${pad(total % 60)}00`;
};
const tz = (prop: string, value: string): string => `${prop};TZID=${LONDON_TZID}:${value}`;
const email = (name: string): string => `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.invalid`;

/** The Monday on or before the given date, at 00:00 UTC. */
export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}

interface Meeting {
  uid: string;
  subject: string;
  category: Template["category"];
  location: string;
  day: Date;
  at: string;
  minutes: number;
  attendees: readonly string[];
  modified: Date;
  extra: readonly string[];
}

function meetingLines(m: Meeting, rand: () => number, organizer: string): readonly string[] {
  const lines = [
    `SUMMARY:${m.subject}`,
    tz("DTSTART", localTime(m.day, m.at)),
    tz("DTEND", localTime(m.day, m.at, m.minutes)),
    `LOCATION:${m.location}`,
    `CATEGORIES:${m.category}`,
    `PRIORITY:${m.category === "Ministerial" ? 1 : m.category === "Internal" && m.minutes <= 30 ? 9 : 5}`,
    `LAST-MODIFIED:${stamp(m.modified)}`,
    `ORGANIZER;CN="${organizer}":mailto:${email(organizer)}`,
    ...m.attendees.map((name, i) =>
      `ATTENDEE;ROLE=${i < 2 ? "REQ-PARTICIPANT" : "OPT-PARTICIPANT"};PARTSTAT=${PARTSTATS[Math.floor(rand() * PARTSTATS.length)]};CN="${name}":mailto:${email(name)}`),
    "TRANSP:OPAQUE",
    `X-MICROSOFT-CDO-BUSYSTATUS:${m.category === "External" && m.minutes >= 240 ? "OOF" : "BUSY"}`,
    ...m.extra,
  ];
  return vevent(m.uid, lines);
}

/** What each principal's weekly series plant, for B8 to compare the Series screen against (OUT-87). */
export const PLANTED_SERIES: Readonly<Record<string, { series: number; exceptions: number; exceptionsAfterUpdate: number }>> = Object.fromEntries(
  PRINCIPALS.map((p) => {
    const planted = p.weekly.filter((w) => w.plant === "exceptions").length;
    return [p.code, { series: p.weekly.length, exceptions: planted, exceptionsAfterUpdate: planted * 2 }];
  }),
);

/** A weekly series' VEVENTs: the series itself, and its moved occurrence when it plants exceptions. */
function seriesLines(w: Weekly, uid: string, firstDay: Date, now: Date, update: boolean): string[][] {
  const day = addDays(firstDay, w.day);
  const at = update && w.plant === "rekey" ? localTime(day, w.at, 30).slice(9, 13) : w.at;
  const details = [`SUMMARY:${w.subject}`, `LOCATION:${w.location}`, `CATEGORIES:${w.category}`, "TRANSP:OPAQUE", "X-MICROSOFT-CDO-BUSYSTATUS:BUSY"];
  const exdate = update && w.plant === "exceptions" ? [tz("EXDATE", localTime(addDays(day, CANCELLED_WEEK * 7), at))] : [];
  const master = [...vevent(uid, [
    ...details, tz("DTSTART", localTime(day, at)), tz("DTEND", localTime(day, at, w.minutes)),
    `RRULE:FREQ=WEEKLY;COUNT=${SERIES_WEEKS}`, ...exdate, `LAST-MODIFIED:${stamp(addDays(now, -60))}`,
  ])];
  if (w.plant !== "exceptions") return [master];
  const moved = addDays(day, MOVED_WEEK * 7);
  return [master, [...vevent(uid, [
    ...details, tz("RECURRENCE-ID", localTime(moved, at)), tz("DTSTART", localTime(moved, at, 60)), tz("DTEND", localTime(moved, at, 60 + w.minutes)),
    `LAST-MODIFIED:${stamp(addDays(now, -20))}`,
  ])]];
}

type SeriesFiles = { base: string[][]; update: string[][] };

function diaryFor(p: Principal, monday: Date, now: Date): { base: Meeting[]; series: SeriesFiles; allDay: string[][] } {
  const rand = random(p.seed);
  const base: Meeting[] = [];
  let n = p.seed * 1000;
  const firstDay = addDays(monday, -14);
  for (let week = 0; week < 8; week += 1) {
    for (let weekday = 0; weekday < 5; weekday += 1) {
      const day = addDays(firstDay, week * 7 + weekday);
      const slots = SLOTS.filter(() => rand() < p.density / SLOTS.length);
      for (const at of slots) {
        const t = TEMPLATES[Math.floor(rand() * TEMPLATES.length)];
        // Freshness: most meetings settled weeks ago, some touched in the last day or two.
        const modified = addDays(now, -(rand() < 0.2 ? rand() * 2 : 3 + rand() * 40));
        base.push({ uid: outlookUid((n += 1)), subject: t.subject, category: t.category, location: t.location, day, at,
          minutes: t.minutes, attendees: t.attendees, modified, extra: [] });
      }
    }
  }
  // One private item a week.
  for (let week = 0; week < 8; week += 1) {
    base.push({ uid: outlookUid((n += 1)), subject: "Medical appointment", category: "Personal", location: "Private",
      day: addDays(firstDay, week * 7 + 2), at: "0800", minutes: 30, attendees: [], modified: addDays(now, -30), extra: ["CLASS:PRIVATE"] });
  }
  const uids = p.weekly.map(() => outlookUid((n += 1)));
  const series: SeriesFiles = {
    base: p.weekly.flatMap((w, i) => seriesLines(w, uids[i]!, firstDay, now, false)),
    update: p.weekly.flatMap((w, i) => seriesLines(w, uids[i]!, firstDay, now, true)),
  };
  const travel = addDays(monday, 7 + 3);
  const allDay = [[...vevent(outlookUid((n += 1)), [
    "SUMMARY:Travel: Edinburgh", `DTSTART;VALUE=DATE:${ymd(travel)}`, `DTEND;VALUE=DATE:${ymd(addDays(travel, 1))}`,
    "LOCATION:Edinburgh", "CATEGORIES:External", "TRANSP:OPAQUE", "X-MICROSOFT-CDO-BUSYSTATUS:OOF", "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE",
  ])]];
  if (p.code === PLANTED_PRINCIPAL) {
    // The planted day holds only the planted engagements (and the weekly private item), so its clashes are known exactly.
    const day = ymd(addDays(monday, PLANTED_WEEKDAY));
    return { base: base.filter((m) => m.category === "Personal" || ymd(m.day) !== day), series, allDay };
  }
  return { base, series, allDay };
}

/** The principal and days with planted clashes and day-summary conditions (OUT-84). */
export const PLANTED_PRINCIPAL = "PRINCIPAL-A";
/** Wednesday of the week of `now`: clashes of every timed severity, a tentative pair, a visit with a speech inside it. */
const PLANTED_WEEKDAY = 2;
/** Saturday of that week: an all-day out-of-office day with a timed engagement on it. */
const PLANTED_WEEKEND = 5;

/** The planted clashes, as [first subject, second subject, severity]. Nothing else clashes on the planted days. */
export const PLANTED_CLASHES: readonly (readonly [string, string, "hard" | "soft" | "away"])[] = [
  ["Board pre-meet", "Investor call", "hard"],
  ["Hold: sector call", "Budget check-in", "soft"],
  ["Lunch: sector leads", "Press photo", "soft"],
  ["Visit: Northfield Works", "Speech: apprentices", "hard"],
  ["Leave", "School fair speech", "away"],
];

/** What the planted Wednesday's day summary shows, with the office day 08:00 to 18:00 and the default limits. */
export const PLANTED_SUMMARY = {
  clashes: { hard: 2, soft: 2, away: 0 },
  // Room 2.01 to The Granary (15 minutes), and Northfield Works to Mansion House (none).
  placeChanges: 2,
  // 14:00 to 18:30 without a break.
  longRun: 270,
  early: "07:30",
  late: "18:30",
  linkedOutside: 0,
} as const;

/** The planted days as YYYY-MM-DD. */
export const plantedDays = (now: Date): { weekday: string; weekend: string } => {
  const monday = mondayOf(now);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { weekday: iso(addDays(monday, PLANTED_WEEKDAY)), weekend: iso(addDays(monday, PLANTED_WEEKEND)) };
};

interface Planted {
  subject: string;
  at: string;
  minutes: number;
  location: string;
  status: "BUSY" | "TENTATIVE" | "FREE";
}

const PLANTED: readonly Planted[] = [
  { subject: "Early breakfast", at: "0730", minutes: 30, location: "The Wolseley", status: "BUSY" },
  { subject: "Reading time", at: "0800", minutes: 30, location: "Office", status: "FREE" },
  { subject: "Board pre-meet", at: "0900", minutes: 60, location: "Board room", status: "BUSY" },
  { subject: "Investor call", at: "0930", minutes: 60, location: VIDEO, status: "BUSY" },
  { subject: "Hold: sector call", at: "1100", minutes: 60, location: VIDEO, status: "TENTATIVE" },
  { subject: "Budget check-in", at: "1130", minutes: 30, location: "Room 2.01", status: "BUSY" },
  { subject: "Lunch: sector leads", at: "1215", minutes: 30, location: "The Granary, Kings Cross", status: "TENTATIVE" },
  { subject: "Press photo", at: "1230", minutes: 30, location: "The Granary, Kings Cross", status: "TENTATIVE" },
  { subject: "Visit: Northfield Works", at: "1400", minutes: 180, location: "Northfield Works", status: "BUSY" },
  { subject: "Speech: apprentices", at: "1500", minutes: 30, location: "Northfield Works", status: "BUSY" },
  { subject: "Evening reception", at: "1700", minutes: 90, location: "Mansion House", status: "BUSY" },
];

function plantedEvents(monday: Date, now: Date, uid: (n: number) => string): string[][] {
  const day = addDays(monday, PLANTED_WEEKDAY);
  const weekend = addDays(monday, PLANTED_WEEKEND);
  const timed = (p: Planted, on: Date, i: number) => vevent(uid(i), [
    `SUMMARY:${p.subject}`, tz("DTSTART", localTime(on, p.at)), tz("DTEND", localTime(on, p.at, p.minutes)),
    `LOCATION:${p.location}`, `LAST-MODIFIED:${stamp(addDays(now, -5))}`,
    p.status === "FREE" ? "TRANSP:TRANSPARENT" : "TRANSP:OPAQUE", `X-MICROSOFT-CDO-BUSYSTATUS:${p.status}`,
  ]);
  return [
    ...PLANTED.map((p, i) => [...timed(p, day, i)]),
    [...vevent(uid(PLANTED.length), [
      "SUMMARY:Leave", `DTSTART;VALUE=DATE:${ymd(weekend)}`, `DTEND;VALUE=DATE:${ymd(addDays(weekend, 1))}`,
      "TRANSP:OPAQUE", "X-MICROSOFT-CDO-BUSYSTATUS:OOF", "X-MICROSOFT-CDO-ALLDAYEVENT:TRUE",
    ])],
    [...timed({ subject: "School fair speech", at: "1000", minutes: 60, location: "Village hall", status: "BUSY" }, weekend, PLANTED.length + 1)],
  ];
}

/** The update: some meetings move, some are cancelled, a few are new, all touched "now". */
function updated(base: readonly Meeting[], seed: number, now: Date): Meeting[] {
  const rand = random(seed + 1);
  let n = seed * 1000 + 900;
  const out: Meeting[] = [];
  for (const m of base) {
    const r = rand();
    if (m.category === "Personal" || m.day < mondayOf(now)) out.push(m);
    else if (r < 0.06) continue; // gone from Outlook
    else if (r < 0.16) out.push({ ...m, day: addDays(m.day, rand() < 0.5 ? 1 : 2), modified: now });
    else if (r < 0.2) out.push({ ...m, location: VIDEO, modified: now });
    else out.push(m);
  }
  for (let i = 0; i < 4; i += 1) {
    const t = TEMPLATES[Math.floor(rand() * TEMPLATES.length)];
    out.push({ uid: outlookUid((n += 1)), subject: t.subject, category: t.category, location: t.location,
      day: addDays(mondayOf(now), 1 + Math.floor(rand() * 10)), at: SLOTS[Math.floor(rand() * SLOTS.length)],
      minutes: t.minutes, attendees: t.attendees, modified: now, extra: [] });
  }
  return out;
}

/** The diary files for every synthetic principal: `<code>.ics` and `<code>-update.ics`. */
export function syntheticDiaries(now: Date): DiaryFile[] {
  const monday = mondayOf(now);
  return PRINCIPALS.flatMap((p) => {
    const rand = random(p.seed + 2);
    const { base, series, allDay } = diaryFor(p, monday, now);
    const planted = p.code === PLANTED_PRINCIPAL ? plantedEvents(monday, now, (i) => outlookUid(p.seed * 1000 + 800 + i)) : [];
    const file = (meetings: readonly Meeting[], weekly: readonly string[][]): string =>
      calendar([...meetings.map((m) => meetingLines(m, rand, p.name)), ...weekly, ...allDay, ...planted]);
    return [
      { fileName: `${p.code}.ics`, text: file(base, series.base) },
      { fileName: `${p.code}-update.ics`, text: file(updated(base, p.seed, now), series.update) },
    ];
  });
}
