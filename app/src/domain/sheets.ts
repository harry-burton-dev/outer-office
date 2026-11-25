// Printed sheets (OUT-62): a principal's days with the office's layer on each
// engagement — its tags, cards, notes and follow-ups with their owners. Pure:
// the screen reads the rows and prints what this returns. A private item shows
// its time only, since a sheet can be handed round.
import { dateIn, addDays } from "./dates";
import { cardFieldsOf, cardsOn, optionsOf, progressOf, valuesOf, type Card, type Template, type TemplateField } from "./cards";
import { eventsForPrincipal, byOrder, type Event, type Overlay, type Task } from "./selectors";
import { eventTags, type Tag } from "./tags";
import { isInside } from "./clashes";

export const PRIVATE_TITLE = "Private, busy";

export interface SheetField {
  label: string;
  value: string;
}

export interface SheetCard {
  name: string;
  done: number;
  total: number;
  /** The filled-in fields, in the template's order. */
  fields: SheetField[];
}

export interface SheetTask {
  title: string;
  /** The assignee's name, or "" when nobody has it. */
  owner: string;
  due: string;
  done: boolean;
}

export interface SheetEntry {
  id: string;
  start: string;
  end: string;
  allDay: boolean;
  title: string;
  masked: boolean;
  location: string;
  flagged: boolean;
  tags: string[];
  /** Required attendees' names, without addresses or responses. */
  attendees: string[];
  notes: string;
  cards: SheetCard[];
  tasks: SheetTask[];
  /** The engagements linked under it and sitting inside it, by start: its run of show (OUT-84). */
  children: SheetEntry[];
}

export interface SheetDay {
  date: string;
  entries: SheetEntry[];
}

export interface SheetInput {
  principal: string;
  /** The first day, YYYY-MM-DD in the office zone. */
  from: string;
  /** How many days from `from`. */
  days: number;
  zone: string;
  events: readonly Event[];
  overlays: readonly Overlay[];
  cards: readonly Card[];
  templates: readonly Template[];
  tasks: readonly Task[];
  tags: readonly Tag[];
  nameOf(userId: string): string;
}

/** Whether the event is on the date: a timed event on its start date, an all-day one on each day it covers. */
function isOn(event: Event, date: string, zone: string): boolean {
  if (!event.start) return false;
  const first = dateIn(event.start, zone);
  if (event.allDay !== true || !event.end) return first === date;
  const last = dateIn(event.end, zone);
  return first <= date && (date < last || first === last);
}

const namesOf = (lines: string | undefined): string[] =>
  (lines ?? "").split("\n").map((line) => (line.split(" · ")[0] ?? "").replace(/ <.*>$/, "").trim()).filter(Boolean);

function fieldText(field: TemplateField, value: string, nameOf: (id: string) => string): string {
  if (field.type === "check") return value === "true" ? "Yes" : "";
  if (field.type === "person") return value ? nameOf(value) : "";
  if (field.type === "choice") {
    const detail = optionsOf(field).find((o) => o.label === value)?.detail;
    return detail ? `${value} (${detail})` : value;
  }
  return value.trim();
}

function sheetCard(card: Card, templates: readonly Template[], nameOf: (id: string) => string): SheetCard {
  const template = templates.find((t) => t.id === card.template && !t._deleted);
  const fields = cardFieldsOf(card, template);
  const values = valuesOf(card.values);
  const progress = progressOf(fields, values);
  return {
    name: template?.name || "Removed template",
    ...progress,
    fields: fields.map((f) => ({ label: f.label, value: fieldText(f, values[f.id] ?? "", nameOf) })).filter((f) => f.value !== ""),
  };
}

function entryOf(event: Event, input: SheetInput, overlay: Overlay | undefined): SheetEntry {
  const base = { id: event.id, start: event.start ?? "", end: event.end ?? "", allDay: event.allDay === true };
  if (event.masked === true) {
    return { ...base, title: PRIVATE_TITLE, masked: true, location: "", flagged: false, tags: [], attendees: [], notes: "", cards: [], tasks: [], children: [] };
  }
  const tasks = input.tasks.filter((t) => !t._deleted && t.event === event.id).sort(byOrder);
  return {
    ...base,
    title: event.subject?.trim() || "Untitled",
    masked: false,
    location: event.location?.trim() ?? "",
    flagged: overlay?.flagged === true,
    tags: eventTags(overlay?.tags, input.tags).map((t) => t.name ?? ""),
    attendees: namesOf(event.requiredAttendees),
    notes: overlay?.notes?.trim() ?? "",
    cards: cardsOn(input.cards, event.id).map((c) => sheetCard(c, input.templates, input.nameOf)),
    tasks: tasks.map((t) => ({ title: t.title || "Untitled", owner: t.assignee ? input.nameOf(t.assignee) : "", due: t.due ?? "", done: t.done === true })),
    children: [],
  };
}

/**
 * The principal's live engagements on each day, all-day ones first, then by start. Gone and archived ones are left out.
 * An engagement linked under another on the day, and sitting inside it, is printed within its parent as a run of show.
 */
export function sheetDays(input: SheetInput): SheetDay[] {
  const overlayOf = new Map(input.overlays.filter((o) => !o._deleted).map((o) => [o.event ?? "", o]));
  const shown = eventsForPrincipal(input.events, input.principal).filter((e) => !overlayOf.get(e.id)?.archived);
  return Array.from({ length: input.days }, (_, i) => {
    const date = addDays(input.from, i);
    const on = shown.filter((e) => isOn(e, date, input.zone)).sort((a, b) => Number(b.allDay === true) - Number(a.allDay === true));
    const onIds = new Set(on.map((e) => e.id));
    const parentOf = (e: Event) => {
      const parent = on.find((p) => p.id === overlayOf.get(e.id)?.parent);
      return parent && onIds.has(parent.id) && isInside(e, parent) ? parent.id : "";
    };
    const nested = new Set(on.filter((e) => parentOf(e) !== "").map((e) => e.id));
    const entries = on.filter((e) => !nested.has(e.id)).map((e) => ({
      ...entryOf(e, input, overlayOf.get(e.id)),
      children: on.filter((c) => parentOf(c) === e.id).map((c) => entryOf(c, input, overlayOf.get(c.id))),
    }));
    return { date, entries };
  });
}
