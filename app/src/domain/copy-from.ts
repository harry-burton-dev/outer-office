// Copy from last time (OUT-88, v0.3 brief §6): fill a tab's cards from the last
// engagement that had the same tab. The same series first, then the same
// organiser within 12 months. Every field is copied except ticks, only into
// empty fields, and never from or to a masked item.
import type { RowOf } from "@trellis/framework";
import { cardFieldsOf, valuesOf, type Card, type Tab, type Template } from "./cards";

type Event = RowOf<"events">;

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 365 * DAY_MS;

/** Which series an engagement belongs to: its principal and uid when it is an occurrence, "" for a single event. */
// TODO(OUT-83): read events.seriesId once it lands.
const seriesKeyOf = (e: Event): string => ((e.recurrenceId ?? "") !== "" ? `${e.principal ?? ""}|${e.uid ?? ""}` : "");

const sameOrganiser = (a: Event, b: Event): boolean => (a.organizer ?? "").trim() !== "" && (a.organizer ?? "").trim().toLowerCase() === (b.organizer ?? "").trim().toLowerCase();

/** The values a target card takes from a source card: each empty, non-tick field the source has filled in. */
export function copiedValues(source: Card, target: Card, templates: ReadonlyMap<string, Template>): Record<string, string> {
  const from = valuesOf(source.values);
  const into = valuesOf(target.values);
  const out: Record<string, string> = {};
  for (const field of cardFieldsOf(target, templates.get(target.template ?? ""))) {
    if (field.type === "check") continue;
    const value = from[field.id] ?? "";
    if (value.trim() !== "" && (into[field.id] ?? "").trim() === "") out[field.id] = value;
  }
  return out;
}

/** Each target card with the values it would take from the source tab, matched by card template. Only cards that gain something are listed. */
export function copyPlan(source: Tab, target: Tab, cards: readonly Card[], templates: ReadonlyMap<string, Template>): { card: Card; values: Record<string, string> }[] {
  const on = (tab: Tab) => cards.filter((c) => !c._deleted && c.tab === tab.id && c.event === tab.event);
  const sources = on(source);
  return on(target)
    .map((card) => {
      const match = sources.find((s) => s.template === card.template);
      return { card, values: match ? copiedValues(match, card, templates) : {} };
    })
    .filter((p) => Object.keys(p.values).length > 0);
}

export interface CopyInput {
  target: Tab;
  events: readonly Event[];
  tabs: readonly Tab[];
  cards: readonly Card[];
  templates: readonly Template[];
}

/** The tab to copy from, or undefined: the last earlier engagement with the same tab template that has something to give. */
export function lastTimeFor(input: CopyInput): Tab | undefined {
  const eventOf = new Map(input.events.filter((e) => !e._deleted).map((e) => [e.id, e]));
  const target = eventOf.get(input.target.event ?? "");
  if (!target || target.masked === true) return undefined;
  const templates = new Map(input.templates.map((t) => [t.id, t]));
  const start = Date.parse(target.start ?? "");
  const candidates = input.tabs
    .filter((t) => !t._deleted && t.id !== input.target.id && t.tabTemplate === input.target.tabTemplate)
    .map((tab) => ({ tab, event: eventOf.get(tab.event ?? "") }))
    .filter((c): c is { tab: Tab; event: Event } => c.event !== undefined && c.event.masked !== true && c.event.gone !== true && Date.parse(c.event.start ?? "") < start)
    .filter((c) => copyPlan(c.tab, input.target, input.cards, templates).length > 0)
    .sort((a, b) => Date.parse(b.event.start ?? "") - Date.parse(a.event.start ?? ""));
  const series = seriesKeyOf(target);
  const inSeries = series === "" ? undefined : candidates.find((c) => seriesKeyOf(c.event) === series);
  const byOrganiser = candidates.find((c) => sameOrganiser(c.event, target) && start - Date.parse(c.event.start ?? "") <= WINDOW_MS);
  return (inSeries ?? byOrganiser)?.tab;
}
