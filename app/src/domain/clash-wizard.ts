// The clash wizard (OUT-85, v0.3 brief 8.2): steps through each unquiet clash
// in a range and suggests fixes. Pure, over rows. Nothing changes until the
// wizard's Apply runs wizard.apply with the chosen fixes.
//
// Each step is read against the diary as the fixes chosen so far would leave
// it, so a later step never suggests a slot an earlier move has taken, and a
// clash an earlier fix has already settled says so instead of offering fixes.
import { clashes, isInside, overlaysByEvent, type Clash } from "./clashes";
import { findATime } from "./find-a-time";
import type { Event, Overlay } from "./selectors";

export type Fix =
  | { kind: "move"; event: string; start: string; end: string }
  | { kind: "quiet"; event: string }
  | { kind: "link"; event: string; parent: string }
  | { kind: "note"; events: readonly [string, string]; note: string }
  | { kind: "leave" };

export interface WizardWorld {
  events: readonly Event[];
  overlays: readonly Overlay[];
  /** Proposals as rows at their proposed times (see findATime). */
  proposed: readonly Event[];
  zone: string;
  dayStart: string;
  dayEnd: string;
  now: string;
}

/** The unquiet clashes the wizard covers: those beginning in [from, to), for one principal, in time order. */
export function wizardClashes(world: Pick<WizardWorld, "events" | "overlays" | "zone">, principal: string, from: string, to: string): Clash[] {
  const mine = world.events.filter((e) => e.principal === principal);
  return clashes(mine, world.overlays, world.zone).filter((c) => c.at >= from && c.at < to);
}

/** The diary and its overlays with fixes applied, as wizard.apply would leave them (moves as proposals). */
export function withFixes(world: WizardWorld, fixes: readonly Fix[]): WizardWorld {
  const overlayOf = overlaysByEvent(world.overlays);
  const proposed = new Map(world.proposed.map((p) => [p.id, p]));
  const byId = new Map(world.events.map((e) => [e.id, e]));
  const changed = new Map<string, Overlay>();
  const overlay = (event: string): Overlay =>
    changed.get(event) ?? overlayOf.get(event) ?? ({ id: `wizard:${event}`, _deleted: false, _conflicts: {}, event, quiet: false, parent: "", priority: 4 } as Overlay);
  for (const fix of fixes) {
    if (fix.kind === "move") {
      const event = byId.get(fix.event);
      if (event) proposed.set(fix.event, { ...event, start: fix.start, end: fix.end });
    } else if (fix.kind === "quiet") changed.set(fix.event, { ...overlay(fix.event), quiet: true });
    else if (fix.kind === "link") changed.set(fix.event, { ...overlay(fix.event), parent: fix.parent });
  }
  const overlays = [...world.overlays.filter((o) => !changed.has(o.event ?? "")), ...changed.values()];
  return { ...world, overlays, proposed: [...proposed.values()] };
}

/** The diary as clashes() should read it: each proposed engagement at its proposed time. */
const asProposed = (world: WizardWorld): Event[] => {
  const moved = new Map(world.proposed.map((p) => [p.id, p]));
  return world.events.map((e) => moved.get(e.id) ?? e);
};

/** Whether the clash still stands in this world (an earlier fix may have settled it). */
export function stillClashes(world: WizardWorld, clash: Clash): boolean {
  const events = asProposed(world).filter((e) => e.id === clash.first || e.id === clash.second);
  return clashes(events, world.overlays, world.zone).length > 0;
}

const priorityOf = (world: WizardWorld, id: string): number => overlaysByEvent(world.overlays).get(id)?.priority ?? 4;
const lengthOf = (e: Event): number => Date.parse(e.end ?? "") - Date.parse(e.start ?? "");

/** The engagement to give way: the lower priority (a higher number), else the shorter, else the later one. */
export function lowerOf(world: WizardWorld, clash: Clash): { lower: string; other: string } {
  const byId = new Map(asProposed(world).map((e) => [e.id, e]));
  const a = byId.get(clash.first);
  const b = byId.get(clash.second);
  const pa = priorityOf(world, clash.first);
  const pb = priorityOf(world, clash.second);
  const firstGives = pa !== pb ? pa > pb : a && b && lengthOf(a) !== lengthOf(b) ? lengthOf(a) < lengthOf(b) : false;
  return firstGives ? { lower: clash.first, other: clash.second } : { lower: clash.second, other: clash.first };
}

/** The first Find a time slot for an engagement, or undefined (all-day engagements aren't moved). */
function firstSlot(world: WizardWorld, id: string): { start: string; end: string } | undefined {
  const event = asProposed(world).find((e) => e.id === id);
  if (!event || event.allDay === true) return undefined;
  const others = world.events.filter((e) => e.id !== id);
  return findATime({ event, events: [event, ...others], overlays: world.overlays, proposed: world.proposed.filter((p) => p.id !== id), zone: world.zone, dayStart: world.dayStart, dayEnd: world.dayEnd, now: world.now, count: 1 })[0];
}

/**
 * The suggested fixes for one clash, in the brief's order: move the lower-priority
 * one to its first free slot; move the other; set the lower-priority one quiet;
 * link one under the other when it sits wholly inside it; leave it.
 */
export function suggestedFixes(world: WizardWorld, clash: Clash): Fix[] {
  const { lower, other } = lowerOf(world, clash);
  const fixes: Fix[] = [];
  for (const id of [lower, other]) {
    const slot = firstSlot(world, id);
    if (slot) fixes.push({ kind: "move", event: id, ...slot });
  }
  fixes.push({ kind: "quiet", event: lower });
  const byId = new Map(asProposed(world).map((e) => [e.id, e]));
  const overlayOf = overlaysByEvent(world.overlays);
  const a = byId.get(clash.first);
  const b = byId.get(clash.second);
  const linkable = (child: Event, parent: Event) =>
    child.allDay !== true && parent.allDay !== true && !overlayOf.get(parent.id)?.parent &&
    !world.overlays.some((o) => !o._deleted && o.parent === child.id) && isInside(child, parent);
  if (a && b) {
    if (linkable(b, a)) fixes.push({ kind: "link", event: b.id, parent: a.id });
    else if (linkable(a, b)) fixes.push({ kind: "link", event: a.id, parent: b.id });
  }
  fixes.push({ kind: "leave" });
  return fixes;
}

/** Applying each clash's first suggestion in turn, as the wizard's default run does. */
export function firstSuggestions(world: WizardWorld, steps: readonly Clash[]): Fix[] {
  const chosen: Fix[] = [];
  for (const clash of steps) {
    const now = withFixes(world, chosen);
    chosen.push(stillClashes(now, clash) ? (suggestedFixes(now, clash)[0] ?? { kind: "leave" }) : { kind: "leave" });
  }
  return chosen;
}
