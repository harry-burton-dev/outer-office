// Series (OUT-87): a principal's recurring meetings as a whole, worked out from
// the stored occurrences. Pure: no hooks.
//
// A series is every event of one principal sharing a UID with a recurrence id
// (the brief's seriesId). CSV engagements have no recurrence id, so never
// appear. Each occurrence keeps its original slot in recurrenceId, so:
// - moved: its start is not its original slot;
// - cancelled: gone from Outlook while a later occurrence is still there;
// - cut: gone with nothing later, so the series was cut short.
import type { Event } from "./selectors";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MONTH_MS = (365.25 / 12) * DAY_MS;

/** How many past occurrences the health line looks back over. */
export const HEALTH_WINDOW = 8;
/** series-ending fires this long before a series' last occurrence. */
export const ENDING_NOTICE_DAYS = 28;

export type OccurrenceState = "as-planned" | "moved" | "cancelled" | "cut";

export interface SeriesOccurrence {
  event: Event;
  state: OccurrenceState;
}

export interface SeriesHealth {
  /** Past occurrences looked at: up to HEALTH_WINDOW. */
  recent: number;
  /** Of those, how many moved. */
  moved: number;
  /** Of those, how many were cancelled. */
  cancelled: number;
  /** The series' last occurrences are gone with nothing after them. */
  cutShort: boolean;
}

export interface Series {
  /** The series UID. */
  key: string;
  principal: string;
  /** The subject of the latest occurrence still in Outlook. */
  subject: string;
  /** Every occurrence stored, in order of original slot. */
  occurrences: SeriesOccurrence[];
  /** The next occurrence still in Outlook that hasn't started, if any. */
  next: Event | undefined;
  /** Occurrences still in Outlook. */
  count: number;
  /** Moved or cancelled occurrences. */
  exceptions: number;
  /** The start of the last occurrence still in Outlook, or "" when none is. */
  end: string;
  health: SeriesHealth;
  /** Hours the series takes in an average month, over the span it covers. */
  hoursPerMonth: number;
}

const ms = (iso: string | undefined): number => Date.parse(iso ?? "");
const bySlot = (a: Event, b: Event) => (a.recurrenceId ?? "").localeCompare(b.recurrenceId ?? "") || a.id.localeCompare(b.id);

/** Whether an occurrence starts somewhere other than its original slot, or an import has seen it move. */
const hasMoved = (event: Event): boolean => (event.moves ?? 0) > 0 || ms(event.start) !== ms(event.recurrenceId);

function statesOf(events: readonly Event[]): SeriesOccurrence[] {
  const sorted = [...events].sort(bySlot);
  let laterLive = false;
  const states: SeriesOccurrence[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const event = sorted[i]!;
    const state: OccurrenceState = event.gone === true ? (laterLive ? "cancelled" : "cut") : hasMoved(event) ? "moved" : "as-planned";
    if (event.gone !== true) laterLive = true;
    states.push({ event, state });
  }
  return states.reverse();
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

/** Live hours spread over the months from the first to the last live occurrence, plus one usual gap. */
function hoursPerMonth(live: readonly Event[]): number {
  if (live.length === 0) return 0;
  const hours = live.reduce((sum, e) => sum + Math.max(0, ms(e.end) - ms(e.start)) / HOUR_MS, 0);
  const starts = live.map((e) => ms(e.start)).sort((a, b) => a - b);
  const gaps = starts.slice(1).map((s, i) => s - starts[i]!);
  const span = starts[starts.length - 1]! - starts[0]! + median(gaps);
  return span <= 0 ? hours : hours / Math.max(1, span / MONTH_MS);
}

function healthOf(occurrences: readonly SeriesOccurrence[], now: number): SeriesHealth {
  const past = occurrences.filter((o) => ms(o.event.recurrenceId) < now).slice(-HEALTH_WINDOW);
  return {
    recent: past.length,
    moved: past.filter((o) => o.state === "moved").length,
    cancelled: past.filter((o) => o.state === "cancelled").length,
    cutShort: occurrences.some((o) => o.state === "cut"),
  };
}

function seriesFrom(key: string, principal: string, events: readonly Event[], now: number): Series {
  const occurrences = statesOf(events);
  const live = occurrences.filter((o) => o.state !== "cancelled" && o.state !== "cut").map((o) => o.event);
  const byStart = [...live].sort((a, b) => ms(a.start) - ms(b.start));
  const last = byStart[byStart.length - 1];
  return {
    key,
    principal,
    subject: last?.subject ?? occurrences[occurrences.length - 1]?.event.subject ?? "",
    occurrences,
    next: byStart.find((e) => ms(e.start) >= now),
    count: live.length,
    exceptions: occurrences.filter((o) => o.state === "moved" || o.state === "cancelled").length,
    end: last?.start ?? "",
    health: healthOf(occurrences, now),
    hoursPerMonth: hoursPerMonth(live),
  };
}

/** A principal's series, the ones with an occurrence still to come first, each group by next or last start. */
export function seriesFor(events: readonly Event[], principal: string, now: string): Series[] {
  const at = ms(now);
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    if (event._deleted || event.principal !== principal || !event.uid || !event.recurrenceId) continue;
    const group = groups.get(event.uid) ?? [];
    group.push(event);
    groups.set(event.uid, group);
  }
  const all = [...groups].map(([key, group]) => seriesFrom(key, principal, group, at));
  const upcoming = all.filter((s) => s.next !== undefined).sort((a, b) => ms(a.next?.start) - ms(b.next?.start) || a.key.localeCompare(b.key));
  const ended = all.filter((s) => s.next === undefined).sort((a, b) => ms(b.end) - ms(a.end) || a.key.localeCompare(b.key));
  return [...upcoming, ...ended];
}

/** "moved 5 of the last 8", "cancelled 1", "cut short", joined; "" when nothing is worth saying. */
export function healthText(health: SeriesHealth): string {
  const parts: string[] = [];
  if (health.moved > 0) parts.push(`moved ${health.moved} of the last ${health.recent}`);
  if (health.cancelled > 0) parts.push(`cancelled ${health.cancelled} of the last ${health.recent}`);
  if (health.cutShort) parts.push("cut short");
  return parts.join(", ");
}

/** Whether a series is within ENDING_NOTICE_DAYS of its last occurrence, which is still to come. */
export function isEnding(series: Series, now: string): boolean {
  const end = ms(series.end);
  const at = ms(now);
  return end > at && end - at <= ENDING_NOTICE_DAYS * DAY_MS;
}

/** A clash between two engagements, by event id: the shape of OUT-84's clashes(). */
export interface ClashPair {
  first: string;
  second: string;
}

export interface StandingClash {
  /** The two series' keys, sorted and joined: stable, for the update's coalesce key. */
  key: string;
  /** The series that clashes on the larger share of its own occurrences. */
  a: Series;
  b: Series;
  /** How many of a's occurrences still in Outlook clash with one of b's. */
  clashing: number;
}

/**
 * Two series clash standing when they clash on at least half of either one's
 * occurrences still in Outlook. Each pair shows once, the worst first.
 */
export function standingClashes(series: readonly Series[], clashes: readonly ClashPair[]): StandingClash[] {
  const seriesOf = new Map<string, Series>();
  for (const s of series) for (const o of s.occurrences) seriesOf.set(o.event.id, s);
  // For each ordered pair of series, the occurrences of the first that clash with the second.
  const hits = new Map<Series, Map<Series, Set<string>>>();
  const hit = (from: string, to: string) => {
    const a = seriesOf.get(from);
    const b = seriesOf.get(to);
    if (!a || !b || a === b) return;
    const row = hits.get(a) ?? new Map<Series, Set<string>>();
    hits.set(a, row);
    const ids = row.get(b) ?? new Set<string>();
    row.set(b, ids);
    ids.add(from);
  };
  for (const c of clashes) {
    hit(c.first, c.second);
    hit(c.second, c.first);
  }
  const found = new Map<string, StandingClash & { share: number }>();
  for (const [a, row] of hits) {
    for (const [b, ids] of row) {
      if (a.count === 0 || ids.size * 2 < a.count) continue;
      const key = [a.key, b.key].sort().join("|");
      const share = ids.size / a.count;
      const seen = found.get(key);
      if (!seen || share > seen.share) found.set(key, { key, a, b, clashing: ids.size, share });
    }
  }
  return [...found.values()].sort((x, y) => y.share - x.share || x.key.localeCompare(y.key)).map(({ share: _share, ...rest }) => rest);
}
