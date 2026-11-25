// Prep readiness (OUT-88, v0.3 brief §6): an engagement is ready when every
// required card on its tabs is complete. A card is required when its form has
// a required field. Cards added on their own, outside a tab, don't count.
// This replaces overlay.prep.
import { cardFieldsOf, isComplete, progressOf, valuesOf, type Card, type Tab, type Template } from "./cards";

export interface Readiness {
  /** Required cards on the engagement's tabs. */
  required: number;
  /** Of those, how many are complete. */
  done: number;
  ready: boolean;
}

/** Each engagement's readiness, by event id. An engagement with no tabs is absent: it needs no prep. */
export function readinessByEvent(tabs: readonly Tab[], cards: readonly Card[], templates: readonly Template[]): Map<string, Readiness> {
  const templateOf = new Map(templates.map((t) => [t.id, t]));
  const liveTabs = new Map(tabs.filter((t) => !t._deleted).map((t) => [t.id, t.event ?? ""]));
  const out = new Map<string, Readiness>();
  for (const event of liveTabs.values()) out.set(event, { required: 0, done: 0, ready: true });
  for (const card of cards) {
    if (card._deleted) continue;
    const event = liveTabs.get(card.tab ?? "");
    if (event === undefined || event !== card.event) continue;
    const fields = cardFieldsOf(card, templateOf.get(card.template ?? ""));
    if (!fields.some((f) => f.required)) continue;
    const r = out.get(event)!;
    r.required += 1;
    if (isComplete(progressOf(fields, valuesOf(card.values)))) r.done += 1;
    r.ready = r.done === r.required;
  }
  return out;
}
