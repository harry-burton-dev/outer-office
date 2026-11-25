// How each tab template is used (OUT-88, v0.3 brief §8, Templates screen):
// over the last 90 days, times applied, the share of started engagements whose
// tab was ready before the start, and the cards most often left empty.
import type { RowOf } from "@trellis/framework";
import { valuesOf, type Card, type Tab, type Template } from "./cards";
import { readinessByEvent } from "./readiness";

type Event = RowOf<"events">;
type LogRow = RowOf<"log">;

const DAY_MS = 24 * 60 * 60 * 1000;
export const USAGE_DAYS = 90;

export interface TabUsage {
  /** Tabs applied in the window, including ones since removed. */
  applied: number;
  /** Of the live ones, how many engagements have started. */
  started: number;
  /** Of those, how many were ready before the start. */
  readyBeforeStart: number;
  /** Card templates whose cards were left empty on started engagements, most often first. */
  leftEmpty: { name: string; count: number }[];
}

export interface UsageInput {
  now: string;
  tabs: readonly Tab[];
  events: readonly Event[];
  cards: readonly Card[];
  templates: readonly Template[];
  log: readonly LogRow[];
}

/** Usage by tab template id. A template never applied in the window is absent. */
export function tabUsage(input: UsageInput): Map<string, TabUsage> {
  const now = Date.parse(input.now);
  const from = now - USAGE_DAYS * DAY_MS;
  const eventOf = new Map(input.events.filter((e) => !e._deleted).map((e) => [e.id, e]));
  const nameOf = new Map(input.templates.map((t) => [t.id, t.name ?? ""]));
  const lastReady = new Map<string, number>();
  for (const row of input.log) {
    if (row._deleted || row.kind !== "card-ready" || !row.event) continue;
    lastReady.set(row.event, Math.max(lastReady.get(row.event) ?? 0, Date.parse(row.at ?? "")));
  }
  const out = new Map<string, TabUsage & { empty: Map<string, number> }>();
  for (const tab of input.tabs) {
    const at = Date.parse(tab.appliedAt ?? "");
    if (!(at >= from && at <= now)) continue;
    const usage = out.get(tab.tabTemplate ?? "") ?? { applied: 0, started: 0, readyBeforeStart: 0, leftEmpty: [], empty: new Map() };
    out.set(tab.tabTemplate ?? "", usage);
    usage.applied += 1;
    const event = eventOf.get(tab.event ?? "");
    const start = Date.parse(event?.start ?? "");
    if (tab._deleted || !event || event.gone === true || !(start <= now)) continue;
    usage.started += 1;
    const cards = input.cards.filter((c) => !c._deleted && c.tab === tab.id);
    const ready = readinessByEvent([tab], cards, input.templates).get(tab.event ?? "")?.ready ?? true;
    const last = lastReady.get(tab.event ?? "");
    if (ready && (last === undefined || last <= start)) usage.readyBeforeStart += 1;
    for (const card of cards) {
      if (Object.values(valuesOf(card.values)).some((v) => v.trim() !== "")) continue;
      const name = nameOf.get(card.template ?? "") || "Removed template";
      usage.empty.set(name, (usage.empty.get(name) ?? 0) + 1);
    }
  }
  return new Map([...out].map(([id, { empty, ...u }]) => [id, { ...u, leftEmpty: [...empty].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) }]));
}
