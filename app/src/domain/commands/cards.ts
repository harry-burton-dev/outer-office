// Card templates and the cards on meetings (OUT-62).
import { defineCommand, type Tx } from "@trellis/framework";
import { FIELD_TYPES, SHAPES, cardFieldsOf, cardTemplatesOf, fieldsOf, isComplete, progressOf, templateTasksOf, valuesOf, type TemplateField, type TemplateTask } from "../cards";
import { createTabTasks } from "./tab-tasks";
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
  return putCard(tx, event, template, "");
});

const nextCardOrder = (tx: Tx, event: string): number => tx.list("cards").filter((c) => c.event === event).reduce((max, c) => Math.max(max, (c.order ?? 0) + 1), 0);

// tx.list doesn't see this run's own writes, so a run adding several cards passes each one's order.
function putCard(tx: Tx, event: string, template: { id: string; fields?: string }, tab: string, order = nextCardOrder(tx, event)): string {
  const id = tx.newId();
  tx.put("cards", id, { event, template: template.id, values: "{}", order, tab, fields: JSON.stringify(fieldsOf(template.fields)) });
  return id;
}

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
  const fields = cardFieldsOf(card, template);
  if (fields.length > 0 && isComplete(progressOf(fields, values)) && !isComplete(progressOf(fields, before))) {
    const event = tx.get("events", card.event ?? "");
    writeLog(tx, input.now, { area: "overlay", kind: "card-ready", principal: event?.principal ?? "", event: card.event ?? "", note: template?.name ?? "" });
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

/** Brings a card's form up to its template's latest fields, keeping what was filled in. Offered, never forced (OUT-88). */
export const cardUpdate = defineCommand("card.update", (tx: Tx, input: { now: string; id: string }) => {
  requireNow(tx, input);
  const card = tx.get("cards", requireText(tx, input.id, "The card"));
  if (!card || card._deleted) tx.fail("That card has been removed.");
  const template = tx.get("templates", card.template ?? "");
  if (!template || template._deleted) tx.fail("That card's template has been removed.");
  tx.put("cards", card.id, { fields: JSON.stringify(fieldsOf(template.fields)) });
});

export interface TabTemplateSaveInput {
  now: string;
  id?: string;
  name?: string;
  shape?: string;
  /** Card template ids, in order. */
  cards?: readonly string[];
  /** The tasks applying it creates. */
  tasks?: readonly TemplateTask[];
}

function checkTasks(tx: Tx, tasks: unknown): TemplateTask[] {
  if (!Array.isArray(tasks)) tx.fail("The tasks must be a list.");
  return tasks.map((t: TemplateTask) => {
    const title = typeof t?.title === "string" ? t.title.trim() : "";
    if (title === "") tx.fail("Every task needs a title.");
    if (!Number.isInteger(t.daysBefore) || t.daysBefore < 0 || t.daysBefore > 365) tx.fail(`${title} needs a whole number of days before, from 0 to 365.`);
    const owner = typeof t.owner === "string" ? t.owner : "";
    return { title, daysBefore: t.daysBefore, owner };
  });
}

/** Adds a tab template, or renames it, changes its shape or its cards, bumping its version. Returns its id (OUT-88). */
export const tabTemplateSave = defineCommand("tabTemplate.save", (tx: Tx, input: TabTemplateSaveInput) => {
  requireNow(tx, input);
  const live = tx.list("tabTemplates");
  const current = input.id === undefined ? undefined : live.find((t) => t.id === input.id);
  if (input.id !== undefined && !current) tx.fail("That tab template has been removed.");
  const name = input.name === undefined ? current?.name ?? "" : input.name.trim();
  if (name === "") tx.fail("Give the tab a name.");
  if (live.some((t) => t.id !== input.id && (t.name ?? "").toLowerCase() === name.toLowerCase())) tx.fail(`There is already a tab called ${name}.`);
  const shape = input.shape ?? current?.shape ?? SHAPES[0];
  if (!(SHAPES as readonly string[]).includes(shape)) tx.fail("Choose one of the shapes.");
  let cards = cardTemplatesOf(current?.cards);
  if (input.cards !== undefined) {
    if (!Array.isArray(input.cards)) tx.fail("The cards must be a list.");
    const templates = new Set(tx.list("templates").map((t) => t.id));
    if (input.cards.some((c) => !templates.has(c))) tx.fail("One of those cards' templates has been removed.");
    cards = [...new Set(input.cards)];
  }
  const tasks = input.tasks === undefined ? templateTasksOf(current?.tasks) : checkTasks(tx, input.tasks);
  const id = current?.id ?? tx.newId();
  const order = current?.order ?? live.reduce((max, t) => Math.max(max, (t.order ?? 0) + 1), 0);
  tx.put("tabTemplates", id, {
    name, shape, cards: cards.join(","), order, version: (current?.version ?? 0) + 1, tasks: JSON.stringify(tasks),
    ...(!current && { triggerKind: "none", trigger: "" }),
  });
  return id;
});

/** Removes a tab template. Tabs made from it stay on their meetings. */
export const tabTemplateRemove = defineCommand("tabTemplate.remove", (tx: Tx, input: { now: string; id: string }) => {
  requireNow(tx, input);
  const current = tx.get("tabTemplates", requireText(tx, input.id, "The tab template"));
  if (!current || current._deleted) tx.fail("That tab template has already been removed.");
  tx.remove("tabTemplates", current.id);
});

export const tabId = (tx: Tx, event: string, tabTemplate: string): string => tx.id("tab", event, tabTemplate);

export type TabVia = "hand" | "tag" | "category" | "series";

/** Puts a tab template on an engagement: the tab, a card per card template with copied fields, and its tasks. An engagement has at most one tab per template, so applying it again returns the tab it has. Shared by tab.apply and the triggers. */
export function applyTab(tx: Tx, now: string, event: { id: string; start?: string; principal?: string }, tabTemplate: { id: string; cards?: string; tasks?: string; version?: number }, via: TabVia): string {
  const id = putTab(tx, now, event.id, tabTemplate, via);
  createTabTasks(tx, now, id, event, tabTemplate.tasks);
  return id;
}

function putTab(tx: Tx, now: string, event: string, tabTemplate: { id: string; cards?: string; version?: number }, via: TabVia): string {
  const id = tabId(tx, event, tabTemplate.id);
  const current = tx.get("tabs", id);
  if (current && !current._deleted) return id;
  if (current?._deleted) tx.restore("tabs", id);
  tx.put("tabs", id, { event, tabTemplate: tabTemplate.id, version: tabTemplate.version ?? 0, appliedAt: now, appliedBy: tx.user, via, orphaned: "" });
  let order = nextCardOrder(tx, event);
  for (const cardTemplate of cardTemplatesOf(tabTemplate.cards)) {
    const t = tx.get("templates", cardTemplate);
    if (t && !t._deleted) putCard(tx, event, t, id, order++);
  }
  return id;
}

/** Applies a tab template to an engagement by hand. Returns the tab's id. */
export const tabApply = defineCommand("tab.apply", (tx: Tx, input: { now: string; event: string; tabTemplate: string }) => {
  requireNow(tx, input);
  const event = requireText(tx, input.event, "The engagement");
  const found = tx.get("events", event);
  if (!found || found._deleted) tx.fail("That engagement hasn't arrived on this computer yet.");
  const template = tx.get("tabTemplates", requireText(tx, input.tabTemplate, "The tab template"));
  if (!template || template._deleted) tx.fail("That tab template has been removed.");
  return applyTab(tx, input.now, found, template, "hand");
});

/** Takes a tab, and the cards that came with it, off its engagement. */
export const tabRemove = defineCommand("tab.remove", (tx: Tx, input: { now: string; id: string }) => {
  requireNow(tx, input);
  const tab = tx.get("tabs", requireText(tx, input.id, "The tab"));
  if (!tab || tab._deleted) tx.fail("That tab has already been removed.");
  for (const card of tx.list("cards").filter((c) => c.tab === tab.id)) tx.remove("cards", card.id);
  tx.remove("tabs", tab.id);
});

/** Brings a tab up to its template's latest version: adds the cards it gained, drops empty cards it lost, and gives every card its template's latest fields. What was filled in is kept. Offered, never forced. */
export const tabUpdate = defineCommand("tab.update", (tx: Tx, input: { now: string; id: string }) => {
  requireNow(tx, input);
  const tab = tx.get("tabs", requireText(tx, input.id, "The tab"));
  if (!tab || tab._deleted) tx.fail("That tab has been removed.");
  const template = tx.get("tabTemplates", tab.tabTemplate ?? "");
  if (!template || template._deleted) tx.fail("That tab's template has been removed.");
  const wanted = cardTemplatesOf(template.cards);
  const cards = tx.list("cards").filter((c) => c.tab === tab.id);
  for (const card of cards) {
    const t = tx.get("templates", card.template ?? "");
    const empty = Object.values(valuesOf(card.values)).every((v) => v.trim() === "");
    if (!wanted.includes(card.template ?? "") && empty) tx.remove("cards", card.id);
    else if (t && !t._deleted) tx.put("cards", card.id, { fields: JSON.stringify(fieldsOf(t.fields)) });
  }
  let order = nextCardOrder(tx, tab.event ?? "");
  for (const cardTemplate of wanted.filter((w) => !cards.some((c) => c.template === w))) {
    const t = tx.get("templates", cardTemplate);
    if (t && !t._deleted) putCard(tx, tab.event ?? "", t, tab.id, order++);
  }
  tx.put("tabs", tab.id, { version: template.version ?? 0 });
});
