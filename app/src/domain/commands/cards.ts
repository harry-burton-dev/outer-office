// Card templates and the cards on meetings (OUT-62).
import { defineCommand, type Tx } from "@trellis/framework";
import { FIELD_TYPES, SHAPES, fieldsOf, isComplete, progressOf, valuesOf, type TemplateField } from "../cards";
import { requireNow, requireText, writeLog } from "./shared";

export interface TemplateSaveInput {
  now: string;
  id?: string;
  name?: string;
  shape?: string;
  fields?: readonly TemplateField[];
}

function checkFields(tx: Tx, fields: unknown): TemplateField[] {
  if (!Array.isArray(fields)) tx.fail("The fields must be a list.");
  const seen = new Set<string>();
  return fields.map((f: TemplateField) => {
    if (typeof f?.id !== "string" || f.id === "" || seen.has(f.id)) tx.fail("Each field needs its own id.");
    seen.add(f.id);
    const label = typeof f.label === "string" ? f.label.trim() : "";
    if (label === "") tx.fail("Every field needs a label.");
    if (!FIELD_TYPES.some((t) => t.value === f.type)) tx.fail(`${label} has a type this app doesn't know.`);
    if (f.type === "choice" && (f.options ?? "").trim() === "") tx.fail(`${label} needs at least one option.`);
    return { id: f.id, label, type: f.type, ...(f.type === "choice" ? { options: f.options ?? "" } : {}), required: f.required === true };
  });
}

/** Adds a template, or renames it, changes its shape or replaces its fields. Returns its id. */
export const templateSave = defineCommand("template.save", (tx: Tx, input: TemplateSaveInput) => {
  requireNow(tx, input);
  const live = tx.list("templates");
  const current = input.id === undefined ? undefined : live.find((t) => t.id === input.id);
  if (input.id !== undefined && !current) tx.fail("That template has been removed.");
  const name = input.name === undefined ? current?.name ?? "" : input.name.trim();
  if (name === "") tx.fail("Give the template a name.");
  if (live.some((t) => t.id !== input.id && (t.name ?? "").toLowerCase() === name.toLowerCase())) tx.fail(`There is already a template called ${name}.`);
  const shape = input.shape ?? current?.shape ?? SHAPES[0];
  if (!(SHAPES as readonly string[]).includes(shape)) tx.fail("Choose one of the shapes.");
  const fields = input.fields === undefined ? fieldsOf(current?.fields) : checkFields(tx, input.fields);
  const id = current?.id ?? tx.newId();
  const order = current?.order ?? live.reduce((max, t) => Math.max(max, (t.order ?? 0) + 1), 0);
  tx.put("templates", id, { name, shape, fields: JSON.stringify(fields), order });
  return id;
});

/** Removes a template. Cards made from it stay on their meetings but show as from a removed template. */
export const templateRemove = defineCommand("template.remove", (tx: Tx, input: { now: string; id: string }) => {
  requireNow(tx, input);
  const id = requireText(tx, input.id, "The template");
  const current = tx.get("templates", id);
  if (!current || current._deleted) tx.fail("That template has already been removed.");
  tx.remove("templates", id);
});

/** Puts a card from a template on a meeting. Returns its id. */
export const cardAdd = defineCommand("card.add", (tx: Tx, input: { now: string; event: string; template: string }) => {
  requireNow(tx, input);
  const event = requireText(tx, input.event, "The engagement");
  const found = tx.get("events", event);
  if (!found || found._deleted) tx.fail("That engagement hasn't arrived on this computer yet.");
  const template = tx.get("templates", requireText(tx, input.template, "The template"));
  if (!template || template._deleted) tx.fail("That template has been removed.");
  const order = tx.list("cards").filter((c) => c.event === event).reduce((max, c) => Math.max(max, (c.order ?? 0) + 1), 0);
  const id = tx.newId();
  tx.put("cards", id, { event, template: template.id, values: "{}", order });
  return id;
});

/** Sets some of a card's values, keeping the rest. */
export const cardSet = defineCommand("card.set", (tx: Tx, input: { now: string; id: string; values: Record<string, string> }) => {
  requireNow(tx, input);
  const id = requireText(tx, input.id, "The card");
  const card = tx.get("cards", id);
  if (!card || card._deleted) tx.fail("That card has been removed.");
  if (typeof input.values !== "object" || input.values === null) tx.fail("Nothing to save.");
  const before = valuesOf(card.values);
  const values = { ...before };
  for (const [key, value] of Object.entries(input.values)) if (typeof value === "string") values[key] = value;
  tx.put("cards", id, { values: JSON.stringify(values) });
  // Logged when the card becomes complete, so Stats can tell prep done before the meeting from after (OUT-69).
  const template = tx.get("templates", card.template ?? "");
  const fields = fieldsOf(template?.fields);
  if (template && isComplete(progressOf(fields, values)) && !isComplete(progressOf(fields, before))) {
    const event = tx.get("events", card.event ?? "");
    writeLog(tx, input.now, { area: "overlay", kind: "card-ready", principal: event?.principal ?? "", event: card.event ?? "", note: template.name ?? "" });
  }
});

/** Takes a card off its meeting. */
export const cardRemove = defineCommand("card.remove", (tx: Tx, input: { now: string; id: string }) => {
  requireNow(tx, input);
  const id = requireText(tx, input.id, "The card");
  const card = tx.get("cards", id);
  if (!card || card._deleted) tx.fail("That card has already been removed.");
  tx.remove("cards", id);
});
