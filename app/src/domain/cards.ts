// Cards (OUT-62): the office designs templates, each a shape shown on the
// meeting and a form; a meeting carries any number of cards, each one template
// filled in. A card is complete when its required fields are filled. Cards
// replace prep.
import type { RowOf } from "@trellis/framework";

export type Template = RowOf<"templates">;
export type Card = RowOf<"cards">;

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
