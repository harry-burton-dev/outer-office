// Cards (OUT-62): the office designs templates, each a shape shown on the
// meeting and a form; a meeting carries any number of cards, each one template
// filled in. A card is complete when its required fields are filled. Cards
// replace prep.
import type { RowOf } from "@trellis/framework";

export type Template = RowOf<"templates">;
export type Card = RowOf<"cards">;
export type TabTemplate = RowOf<"tabTemplates">;
export type Tab = RowOf<"tabs">;

export const FIELD_TYPES = [
  { value: "text", label: "Short text" },
  { value: "longtext", label: "Long text" },
  { value: "choice", label: "Choice" },
  { value: "phone", label: "Phone number" },
  { value: "email", label: "Email" },
  { value: "person", label: "Person in the office" },
  { value: "check", label: "Tick box" },
] as const;
export type FieldType = (typeof FIELD_TYPES)[number]["value"];

export interface TemplateField {
  id: string;
  label: string;
  type: FieldType;
  /** For a choice: one option per line, "Label" or "Label | detail" (the detail shows once chosen, e.g. a dial-in number). */
  options?: string;
  required?: boolean;
}

/** The shapes a template can show on a meeting, by lucide icon. */
export const SHAPES = ["phone", "user", "users", "video", "map-pin", "file-text", "clipboard-check", "briefcase", "car", "utensils", "shield", "star"] as const;
export type Shape = (typeof SHAPES)[number];

const isField = (f: unknown): f is TemplateField =>
  typeof f === "object" && f !== null && typeof (f as TemplateField).id === "string" && typeof (f as TemplateField).label === "string" &&
  FIELD_TYPES.some((t) => t.value === (f as TemplateField).type);

/** A template's fields, from their stored JSON. Anything unreadable is left out. */
export function fieldsOf(json: string | undefined): TemplateField[] {
  try {
    const parsed: unknown = JSON.parse(json || "[]");
    return Array.isArray(parsed) ? parsed.filter(isField) : [];
  } catch {
    return [];
  }
}

/** A card's values, from their stored JSON. */
export function valuesOf(json: string | undefined): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(json || "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}

export interface ChoiceOption {
  label: string;
  detail: string;
}

/** A choice field's options: "Teams bridge | 020 7946 0000" is the label and its detail. */
export const optionsOf = (field: TemplateField): ChoiceOption[] =>
  (field.options ?? "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [label = "", ...rest] = line.split("|");
    return { label: label.trim(), detail: rest.join("|").trim() };
  });

const filled = (field: TemplateField, value: string | undefined): boolean => (field.type === "check" ? value === "true" : (value ?? "").trim() !== "");

/** How far a card is filled in: its required fields, or all its fields when none is required. */
export function progressOf(fields: readonly TemplateField[], values: Readonly<Record<string, string>>): { done: number; total: number } {
  const counted = fields.some((f) => f.required) ? fields.filter((f) => f.required) : fields;
  return { done: counted.filter((f) => filled(f, values[f.id])).length, total: counted.length };
}

export const isComplete = (progress: { done: number; total: number }): boolean => progress.done === progress.total;

/** Live templates in their order. */
export const sortedTemplates = (templates: readonly Template[]): Template[] =>
  templates.filter((t) => !t._deleted).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name ?? "").localeCompare(b.name ?? ""));

/** An event's live cards in their order. */
export const cardsOn = (cards: readonly Card[], eventId: string): Card[] =>
  cards.filter((c) => !c._deleted && c.event === eventId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));

/** A card's own fields: the copy taken when it was added, or its template's for a card older than tabs (OUT-88). */
export const cardFieldsOf = (card: Pick<Card, "fields">, template: Pick<Template, "fields"> | undefined): TemplateField[] =>
  (card.fields ?? "") !== "" ? fieldsOf(card.fields) : fieldsOf(template?.fields);

/** True when the card's template has changed its fields since the card copied them. */
export const cardIsBehind = (card: Pick<Card, "fields">, template: Pick<Template, "fields" | "_deleted"> | undefined): boolean =>
  template !== undefined && !template._deleted && (card.fields ?? "") !== "" && JSON.stringify(fieldsOf(card.fields)) !== JSON.stringify(fieldsOf(template.fields));

/** A tab template's card templates, in order, from their stored comma list. */
export const cardTemplatesOf = (list: string | undefined): string[] => (list ?? "").split(",").map((id) => id.trim()).filter(Boolean);

/** True when the tab's template has been edited since the tab was applied or last updated, or one of its cards is behind its own template. */
export const tabIsBehind = (tab: Pick<Tab, "version">, template: Pick<TabTemplate, "version" | "_deleted"> | undefined, cards: readonly Card[], templates: ReadonlyMap<string, Template>): boolean =>
  (template !== undefined && !template._deleted && (template.version ?? 0) > (tab.version ?? 0)) ||
  cards.some((c) => cardIsBehind(c, templates.get(c.template ?? "")));

/** Live tab templates in their order. */
export const sortedTabTemplates = (templates: readonly TabTemplate[]): TabTemplate[] =>
  templates.filter((t) => !t._deleted).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name ?? "").localeCompare(b.name ?? ""));

/** An event's live tabs, in their templates' order. */
export function tabsOn(tabs: readonly Tab[], eventId: string, tabTemplates: readonly TabTemplate[] = []): Tab[] {
  const order = new Map(tabTemplates.map((t) => [t.id, t.order ?? 0]));
  const at = (t: Tab) => order.get(t.tabTemplate ?? "") ?? Number.MAX_SAFE_INTEGER;
  return tabs.filter((t) => !t._deleted && t.event === eventId).sort((a, b) => at(a) - at(b) || a.id.localeCompare(b.id));
}

/** A task a tab template creates when it is applied: due daysBefore days before the engagement, owned by owner (a user id) or nobody (D16). */
export interface TemplateTask {
  title: string;
  daysBefore: number;
  owner: string;
}

const isTemplateTask = (t: unknown): t is TemplateTask =>
  typeof t === "object" && t !== null && typeof (t as TemplateTask).title === "string" &&
  Number.isInteger((t as TemplateTask).daysBefore) && typeof (t as TemplateTask).owner === "string";

/** A tab template's tasks, from their stored JSON. Anything unreadable is left out. */
export function templateTasksOf(json: string | undefined): TemplateTask[] {
  try {
    const parsed: unknown = JSON.parse(json || "[]");
    return Array.isArray(parsed) ? parsed.filter(isTemplateTask) : [];
  } catch {
    return [];
  }
}
