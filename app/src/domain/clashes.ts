// Clashes and linked engagements (OUT-84, v0.3 brief 5.1 and 5.2). Pure reads
// over rows, worked out when read: the calendar marks, the day summary, the
// clash wizard and the clash rule all use clashes() and nothing else.
import { dateIn } from "./dates";
import type { Event, Overlay } from "./selectors";

/** Hard: both busy, out of office or working elsewhere. Soft: either is tentative. Away: an all-day out-of-office day with a timed engagement. */
export type ClashSeverity = "hard" | "soft" | "away";
export const CLASH_SEVERITIES: readonly ClashSeverity[] = ["hard", "soft", "away"];

export interface Clash {
  /** The engagement that starts first (for away, the all-day one). */
  first: string;
  second: string;
  severity: ClashSeverity;
  /** The instant the clash begins: the later start, or the timed engagement's start. */
  at: string;
}

type Timed = Event & { start: string; end: string };

const live = <T extends { _deleted: boolean }>(row: T | undefined): row is T => row !== undefined && !row._deleted;
const hasTimes = (e: Event): e is Timed => Boolean(e.start) && Boolean(e.end);
const ms = (iso: string): number => Date.parse(iso);

/** Free never clashes. Anything else Outlook can show (busy, tentative, out of office, working elsewhere) does. */
export const occupies = (event: Event): boolean => event.showAs !== "free";
const isTentative = (event: Event): boolean => event.showAs === "tentative";

/** The live overlay of each event, by event id. */
export const overlaysByEvent = (overlays: readonly Overlay[]): Map<string, Overlay> =>
  new Map(overlays.filter((o) => !o._deleted && o.event).map((o) => [o.event ?? "", o]));

/** The principal's engagements still in the diary: not removed, gone from Outlook or archived by the office. */
function inDiary(events: readonly Event[], overlayOf: ReadonlyMap<string, Overlay>): Timed[] {
  return events.filter((e): e is Timed => live(e) && e.gone !== true && hasTimes(e) && !overlayOf.get(e.id)?.archived);
}

const byStart = (a: Timed, b: Timed) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.id.localeCompare(b.id);

/** The days an all-day engagement covers, first and after-last, in the zone. */
function daysOf(event: Timed, zone: string): { first: string; end: string } {
  const first = dateIn(event.start, zone);
  const end = dateIn(event.end, zone);
  return { first, end: end > first ? end : `${first}~` };
}

/**
 * Every pair of the same principal's engagements that clash, in time order. Gone,
 * archived, quiet and free engagements never clash, nor does a linked child with
 * its parent. Two all-day engagements never clash with each other, and an
 * all-day one clashes only when it is out of office (away).
 */
export function clashes(events: readonly Event[], overlays: readonly Overlay[], zone: string): Clash[] {
  const overlayOf = overlaysByEvent(overlays);
  const parentOf = (e: Event) => overlayOf.get(e.id)?.parent ?? "";
  const linked = (a: Event, b: Event) => parentOf(a) === b.id || parentOf(b) === a.id;
  const eligible = inDiary(events, overlayOf).filter((e) => occupies(e) && overlayOf.get(e.id)?.quiet !== true);
  const byPrincipal = new Map<string, Timed[]>();
  for (const e of eligible) byPrincipal.set(e.principal ?? "", [...(byPrincipal.get(e.principal ?? "") ?? []), e]);
  const found: Clash[] = [];
  for (const mine of byPrincipal.values()) {
    const timed = mine.filter((e) => e.allDay !== true).sort(byStart);
    for (let i = 0; i < timed.length; i += 1) {
      const a = timed[i];
      for (let j = i + 1; j < timed.length && ms(timed[j].start) < ms(a.end); j += 1) {
        const b = timed[j];
        if (ms(a.start) >= ms(b.end) || linked(a, b)) continue;
        found.push({ first: a.id, second: b.id, severity: isTentative(a) || isTentative(b) ? "soft" : "hard", at: b.start });
      }
    }
    for (const away of mine.filter((e) => e.allDay === true && e.showAs === "oof").sort(byStart)) {
      const { first, end } = daysOf(away, zone);
      for (const t of timed) {
        const day = dateIn(t.start, zone);
        if (day >= first && day < end && !linked(away, t)) found.push({ first: away.id, second: t.id, severity: "away", at: t.start });
      }
    }
  }
  return found.sort((x, y) => x.at.localeCompare(y.at) || x.first.localeCompare(y.first) || x.second.localeCompare(y.second));
}

/** Each engagement's clash partners and the worst severity it is in, for the calendar's marks. */
export function clashesByEvent(found: readonly Clash[]): Map<string, { severity: ClashSeverity; with: string[] }> {
  const rank = (s: ClashSeverity) => CLASH_SEVERITIES.indexOf(s);
  const out = new Map<string, { severity: ClashSeverity; with: string[] }>();
  const add = (id: string, other: string, severity: ClashSeverity) => {
    const seen = out.get(id);
    if (!seen) out.set(id, { severity, with: [other] });
    else out.set(id, { severity: rank(severity) < rank(seen.severity) ? severity : seen.severity, with: [...seen.with, other] });
  };
  for (const c of found) {
    add(c.first, c.second, c.severity);
    add(c.second, c.first, c.severity);
  }
  return out;
}

/** Whether `child` sits wholly inside `parent`. */
export const isInside = (child: Event, parent: Event): boolean =>
  hasTimes(child) && hasTimes(parent) && ms(parent.start) <= ms(child.start) && ms(child.end) <= ms(parent.end);

/** The engagements linked under `parentId`, by start. */
export function childrenOf(parentId: string, events: readonly Event[], overlays: readonly Overlay[]): Event[] {
  const overlayOf = overlaysByEvent(overlays);
  return inDiary(events, overlayOf).filter((e) => overlayOf.get(e.id)?.parent === parentId).sort(byStart);
}

/** The linked engagements a sync has moved outside their parent (the link stays, flagged). */
export function linkedOutside(events: readonly Event[], overlays: readonly Overlay[]): Set<string> {
  const overlayOf = overlaysByEvent(overlays);
  const shown = inDiary(events, overlayOf);
  const byId = new Map(shown.map((e) => [e.id, e]));
  return new Set(shown.filter((e) => {
    const parent = byId.get(overlayOf.get(e.id)?.parent ?? "");
    return parent !== undefined && !isInside(e, parent);
  }).map((e) => e.id));
}

/**
 * The engagement the Overview suggests linking `event` under: one of the same
 * principal's on the same day that holds it wholly and is at least twice as long,
 * and isn't linked itself. The shortest such one, or undefined. Nothing is
 * suggested for an engagement already linked, or one with children of its own.
 */
export function suggestedParent(event: Event, events: readonly Event[], overlays: readonly Overlay[], zone: string): Event | undefined {
  const overlayOf = overlaysByEvent(overlays);
  if (!hasTimes(event) || event.allDay === true || overlayOf.get(event.id)?.parent) return undefined;
  const shown = inDiary(events, overlayOf);
  if (shown.some((e) => overlayOf.get(e.id)?.parent === event.id)) return undefined;
  const length = (e: Timed) => ms(e.end) - ms(e.start);
  const day = dateIn(event.start, zone);
  return shown
    .filter((p) => p.id !== event.id && p.principal === event.principal && p.allDay !== true && !overlayOf.get(p.id)?.parent &&
      dateIn(p.start, zone) === day && isInside(event, p) && length(p) >= 2 * length(event))
    .sort((a, b) => length(a) - length(b) || byStart(a, b))[0];
}
