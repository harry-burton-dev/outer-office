// The day summary on each day header (OUT-84, v0.3 brief 5.4): is this day
// workable for the principal? Pure: counted from one principal's engagements.
import { dateIn, formatTime } from "./dates";
import { overlaysByEvent, type Clash, type ClashSeverity, linkedOutside, occupies } from "./clashes";
import { ONLINE } from "./lenses";
import type { Event, Overlay } from "./selectors";

export const DEFAULT_LONG_RUN_HOURS = 4;
export const DEFAULT_PLACE_CHANGE_MINUTES = 30;
/** A gap shorter than this doesn't break a run. */
export const BREAK_MINUTES = 15;

export interface DaySummaryInput {
  /** YYYY-MM-DD in the office zone. */
  date: string;
  zone: string;
  principal: string;
  events: readonly Event[];
  overlays: readonly Overlay[];
  /** clashes() over the same rows, worked out once for every day shown. */
  clashes: readonly Clash[];
  /** "08:00" */
  dayStart: string;
  dayEnd: string;
  longRunHours?: number;
  placeChangeMinutes?: number;
}

export interface DaySummary {
  clashes: Record<ClashSeverity, number>;
  /** Consecutive in-person engagements in different places, less than placeChangeMinutes apart. */
  placeChanges: number;
  /** The longest run without a break, in minutes, when longer than longRunHours; otherwise 0. */
  longRun: number;
  /** The earliest start before the working day ("07:30"), or "". */
  early: string;
  /** The latest end after the working day ("19:15"), or "". */
  late: string;
  /** Linked engagements a sync has moved outside their parent. */
  linkedOutside: number;
}

type Timed = Event & { start: string; end: string };
const MINUTE = 60_000;
const ms = (iso: string) => Date.parse(iso);
const minuteOf = (time: string) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
};
const place = (e: Event): string => (e.masked === true ? "" : (e.location ?? "").trim().toLowerCase());
const inPerson = (e: Event): boolean => place(e) !== "" && !ONLINE.test(place(e));

/** Whether a summary has anything to say. */
export const hasWarnings = (s: DaySummary): boolean =>
  s.clashes.hard + s.clashes.soft + s.clashes.away + s.placeChanges + s.linkedOutside > 0 || s.longRun > 0 || s.early !== "" || s.late !== "";

/**
 * The summary of one day. Clashes are the unquiet ones beginning that day. The
 * rest count the principal's timed engagements starting that day that aren't
 * gone, archived or free; a linked child is part of its parent's place.
 */
export function daySummary(input: DaySummaryInput): DaySummary {
  const { date, zone } = input;
  const overlayOf = overlaysByEvent(input.overlays);
  const mine = input.events.filter((e) => !e._deleted && e.principal === input.principal);
  const day = mine
    .filter((e): e is Timed => e.gone !== true && Boolean(e.start) && Boolean(e.end) && e.allDay !== true && occupies(e) &&
      !overlayOf.get(e.id)?.archived && dateIn(e.start ?? "", zone) === date)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const ids = new Set(mine.map((e) => e.id));

  const counts: Record<ClashSeverity, number> = { hard: 0, soft: 0, away: 0 };
  for (const c of input.clashes) if (ids.has(c.second) && dateIn(c.at, zone) === date) counts[c.severity] += 1;

  let placeChanges = 0;
  let last: Timed | undefined;
  for (const e of day.filter((e) => inPerson(e) && !overlayOf.get(e.id)?.parent)) {
    if (last && place(e) !== place(last) && ms(e.start) - ms(last.end) < (input.placeChangeMinutes ?? DEFAULT_PLACE_CHANGE_MINUTES) * MINUTE) placeChanges += 1;
    if (!last || ms(e.end) > ms(last.end)) last = e;
  }

  let longest = 0;
  let runStart = 0;
  let runEnd = -Infinity;
  for (const e of day) {
    if (ms(e.start) - runEnd >= BREAK_MINUTES * MINUTE) runStart = ms(e.start);
    runEnd = Math.max(runEnd, ms(e.end));
    longest = Math.max(longest, runEnd - runStart);
  }
  const longRun = longest > (input.longRunHours ?? DEFAULT_LONG_RUN_HOURS) * 60 * MINUTE ? Math.round(longest / MINUTE) : 0;

  const startMinute = (e: Timed) => minuteOf(formatTime(e.start, zone));
  const endsAfter = (e: Timed) => dateIn(e.end, zone) > date ? 24 * 60 + 1 : minuteOf(formatTime(e.end, zone));
  const earliest = day.find((e) => startMinute(e) < minuteOf(input.dayStart));
  const latest = day.filter((e) => endsAfter(e) > minuteOf(input.dayEnd)).sort((a, b) => b.end.localeCompare(a.end))[0];

  const outside = linkedOutside(input.events, input.overlays);
  return {
    clashes: counts,
    placeChanges,
    longRun,
    early: earliest ? formatTime(earliest.start, zone) : "",
    late: latest ? formatTime(latest.end, zone) : "",
    linkedOutside: day.filter((e) => outside.has(e.id)).length,
  };
}
