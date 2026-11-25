// Stats (OUT-69): simple counts for the office over a month, per principal.
// Pure reads over events, overlays, tabs, cards, templates and the log.
// Prep reads tab readiness (OUT-88).
import type { RowOf } from "@trellis/framework";
import type { Card, Tab, Template } from "./cards";
import { readinessByEvent, type Readiness } from "./readiness";
import { instantIn } from "./dates";
import type { Event, Overlay } from "./selectors";

type LogRow = RowOf<"log">;

export interface StatsInput {
  /** The month, as YYYY-MM, in the office's zone. */
  month: string;
  timezone: string;
  /** ISO UTC instant. Prep is only judged for engagements that have started. */
  now: string;
  events: readonly Event[];
  overlays: readonly Overlay[];
  tabs: readonly Tab[];
  cards: readonly Card[];
  templates: readonly Template[];
  log: readonly LogRow[];
}

export interface PrincipalStats {
  /** Engagements starting in the month: not gone, not archived, not all-day. */
  engagements: number;
  /** Engagements that have started and carry a required card on a tab. */
  withCards: number;
  /** Of those, ready (every required card on its tabs complete), and not last completed after the start. */
  prepOnTime: number;
  /** Of those, ready, but the last card completed after the start. */
  prepLate: number;
  /** Times an engagement moved in Outlook during the month, from the log. */
  moves: number;
}

export const EMPTY_STATS: PrincipalStats = { engagements: 0, withCards: 0, prepOnTime: 0, prepLate: 0, moves: 0 };

/** The month after a YYYY-MM month. */
export function nextMonth(month: string, step = 1): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + step;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The month's first and next month's first, as UTC instants in the zone. */
export function monthRange(month: string, timezone: string): { from: string; to: string } {
  return { from: instantIn(`${month}-01`, "00:00", timezone), to: instantIn(`${nextMonth(month)}-01`, "00:00", timezone) };
}

const inRange = (iso: string | undefined, from: number, to: number) => {
  const t = Date.parse(iso ?? "");
  return t >= from && t < to;
};

type Prep = "none" | "on-time" | "late" | "not-ready";

function prepOf(event: Event, readiness: ReadonlyMap<string, Readiness>, readyAt: ReadonlyMap<string, string>): Prep {
  const r = readiness.get(event.id);
  if (r === undefined || r.required === 0) return "none";
  if (!r.ready) return "not-ready";
  const last = readyAt.get(event.id);
  return last !== undefined && Date.parse(last) > Date.parse(event.start ?? "") ? "late" : "on-time";
}

/** Counts per principal id. A principal with nothing in the month is absent. */
export function officeStats(input: StatsInput): Map<string, PrincipalStats> {
  const { from, to } = monthRange(input.month, input.timezone);
  const [start, end, now] = [Date.parse(from), Date.parse(to), Date.parse(input.now)];
  const archived = new Set(input.overlays.filter((o) => !o._deleted && (o.archived ?? "") !== "").map((o) => o.event ?? ""));
  const readiness = readinessByEvent(input.tabs, input.cards, input.templates);
  const readyAt = new Map<string, string>();
  for (const row of input.log) {
    if (row._deleted || row.kind !== "card-ready" || !row.event || !row.at) continue;
    const seen = readyAt.get(row.event);
    if (seen === undefined || row.at > seen) readyAt.set(row.event, row.at);
  }
  const stats = new Map<string, PrincipalStats>();
  const of = (principal: string) => {
    const found = stats.get(principal) ?? { ...EMPTY_STATS };
    stats.set(principal, found);
    return found;
  };
  for (const event of input.events) {
    if (event._deleted || event.gone === true || event.allDay === true || archived.has(event.id) || !event.principal) continue;
    if (!inRange(event.start, start, end)) continue;
    const row = of(event.principal);
    row.engagements += 1;
    if (Date.parse(event.start ?? "") > now) continue;
    const prep = prepOf(event, readiness, readyAt);
    if (prep === "none") continue;
    row.withCards += 1;
    if (prep === "on-time") row.prepOnTime += 1;
    if (prep === "late") row.prepLate += 1;
  }
  for (const row of input.log) {
    if (row._deleted || row.area !== "calendar" || row.kind !== "moved" || !row.principal) continue;
    if (inRange(row.at, start, end)) of(row.principal).moves += 1;
  }
  return stats;
}

/** The sum over every principal. */
export const totalOf = (rows: Iterable<PrincipalStats>): PrincipalStats => {
  const total = { ...EMPTY_STATS };
  for (const r of rows) for (const key of Object.keys(total) as (keyof PrincipalStats)[]) total[key] += r[key];
  return total;
};
