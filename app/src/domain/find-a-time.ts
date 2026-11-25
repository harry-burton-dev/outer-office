// Find a time (OUT-85, v0.3 brief 5.5): the next free slots for an engagement,
// for the Move dialog. Pure, over rows. A slot is free when moving the
// engagement there leaves it in no clash under 5.1 (clashes() decides), with
// proposals counted as busy where they are proposed to go.
import { clashes } from "./clashes";
import { addDays, dateIn, instantIn, weekdayOf } from "./dates";
import type { Event, Overlay } from "./selectors";

export interface Slot {
  start: string;
  end: string;
}

export interface FindATimeInput {
  /** The engagement being moved, at the time it is moved from. */
  event: Event;
  /** Every engagement (any principal; only the event's principal's are read). */
  events: readonly Event[];
  overlays: readonly Overlay[];
  /** Proposals as rows at their proposed times: a moved engagement under its own id, a new meeting under its own. They count as busy. */
  proposed?: readonly Event[];
  zone: string;
  /** The working day, "08:00" and "18:00". */
  dayStart: string;
  dayEnd: string;
  /** No slot starts before this instant. */
  now: string;
  /** How many slots (default 3). */
  count?: number;
}

export const SNAP_MINUTES = 15;
/** How many working days it searches, the original day first. */
export const SEARCH_DAYS = 10;
const SATURDAY = 6;
const SUNDAY = 0;
const DAY_MINUTES = 24 * 60;

const minutesOf = (time: string): number => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
};
const hhmm = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const isWeekend = (date: string): boolean => [SATURDAY, SUNDAY].includes(weekdayOf(date));

/**
 * The next `count` slots of the event's length on a 15-minute snap: inside the
 * working day, on a weekday unless the event is at a weekend, after `now`, not
 * where it already is, and with no clash. It looks at the original day first and
 * then forward, up to 10 working days. Fewer than `count` when there are no more.
 */
export function findATime({ event, events, overlays, proposed = [], zone, dayStart, dayEnd, now, count = 3 }: FindATimeInput): Slot[] {
  if (!event.start || !event.end) return [];
  const length = Date.parse(event.end) - Date.parse(event.start);
  const first = minutesOf(dayStart);
  const last = minutesOf(dayEnd);
  if (length <= 0 || last <= first) return [];
  const anyDay = isWeekend(dateIn(event.start, zone));
  // Proposals stand in for the engagements they move; the event itself is the candidate.
  const replaced = new Set(proposed.map((p) => p.id));
  const others = [
    ...events.filter((e) => e.principal === event.principal && e.id !== event.id && !replaced.has(e.id)),
    ...proposed.filter((p) => p.principal === event.principal && p.id !== event.id),
  ];
  const slots: Slot[] = [];
  let day = dateIn(event.start, zone);
  for (let searched = 0; searched < SEARCH_DAYS && slots.length < count; day = addDays(day, 1)) {
    if (!anyDay && isWeekend(day)) continue;
    searched += 1;
    const dayFrom = Date.parse(instantIn(day, "00:00", zone));
    // Only the engagements near this day can clash with a slot on it.
    const near = others.filter((e) => e.start && e.end && Date.parse(e.end) > dayFrom - DAY_MINUTES * 60_000 && Date.parse(e.start) < dayFrom + 2 * DAY_MINUTES * 60_000);
    // Clocks change in the night, so within the working day wall-clock minutes and elapsed minutes agree.
    for (let minute = Math.ceil(first / SNAP_MINUTES) * SNAP_MINUTES; minute + length / 60_000 <= last && slots.length < count; minute += SNAP_MINUTES) {
      const start = instantIn(day, hhmm(minute), zone);
      const end = new Date(Date.parse(start) + length).toISOString();
      if (Date.parse(start) < Date.parse(now) || Date.parse(start) === Date.parse(event.start)) continue;
      const moved = { ...event, start, end } as Event;
      const found = clashes([moved, ...near], overlays, zone);
      if (found.some((c) => c.first === event.id || c.second === event.id)) continue;
      slots.push({ start, end });
    }
  }
  return slots;
}
