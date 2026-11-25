// tag.save, tag.remove, tags.set: the office's tags, and which tags a task or event carries.
// category.save: an Outlook category's colour and order (imports create categories, OUT-83).
import { defineCommand, type Tx } from "@trellis/framework";
import { TAG_COLOURS, tagIdsOf } from "../tags";
import { overlayId } from "./overlay";
import { requireNow, requireText, writeLog } from "./shared";
import { applyTriggeredTabs, releaseTriggeredTabs } from "./tab-triggers";

export interface TagSaveInput {
  now: string;
  /** Leave out to add a tag. */
  id?: string;
  name?: string;
  colour?: string;
  order?: number;
}

export interface TagRemoveInput {
  now: string;
  id: string;
}

export interface TagsSetInput {
  now: string;
  target: "event" | "task";
  /** The event or task id. */
  id: string;
  /** Tag ids; replaces what was set before. */
  tags: readonly string[];
}

export interface CategorySaveInput {
  now: string;
  id: string;
  colour?: string;
  order?: number;
}

const COLOURS = new Set(TAG_COLOURS.map((c) => c.value));

function checkColour(tx: Tx, colour: unknown): string | undefined {
  if (colour === undefined) return undefined;
  if (typeof colour !== "string" || !COLOURS.has(colour)) tx.fail("Choose one of the tag colours.");
  return colour;
}

function checkUniqueName(tx: Tx, name: string, id: string | undefined): void {
  const clash = tx.list("tags").find((t) => t.id !== id && (t.name ?? "").trim().toLowerCase() === name.toLowerCase());
  if (clash) tx.fail(`There is already a tag called ${name}.`);
}

/** Adds a tag, or renames, recolours or reorders one. Returns its id. */
export const tagSave = defineCommand("tag.save", (tx: Tx, input: TagSaveInput) => {
  requireNow(tx, input);
  const colour = checkColour(tx, input.colour);
  if (input.id === undefined) {
    const name = requireText(tx, input.name, "The tag's name");
    checkUniqueName(tx, name, undefined);
    const order = tx.list("tags").length;
    const id = tx.newId();
    tx.put("tags", id, { name, colour: colour ?? TAG_COLOURS[order % TAG_COLOURS.length].value, order });
    return id;
  }
  const current = tx.get("tags", input.id);
  if (!current || current._deleted) tx.fail("That tag has been removed.");
  const name = input.name === undefined ? undefined : requireText(tx, input.name, "The tag's name");
  if (name !== undefined) checkUniqueName(tx, name, input.id);
  tx.put("tags", input.id, { ...(name !== undefined && { name }), ...(colour !== undefined && { colour }), ...(input.order !== undefined && { order: input.order }) });
  return input.id;
});

/** Removes a tag. Tasks and events that carried it stop showing it. */
export const tagRemove = defineCommand("tag.remove", (tx: Tx, input: TagRemoveInput) => {
  requireNow(tx, input);
  const current = tx.get("tags", requireText(tx, input.id, "The tag"));
  if (!current || current._deleted) return;
  tx.remove("tags", input.id);
});

/** One tag-added or tag-removed log row per tag that changed (OUT-83), naming the tag. */
function logTags(tx: Tx, now: string, before: string | undefined, after: string, at: { area: "overlay" | "task"; principal: string; event?: string; task?: string }): void {
  const [was, is] = [new Set(tagIdsOf(before)), new Set(tagIdsOf(after))];
  const name = (id: string) => tx.get("tags", id)?.name ?? "";
  for (const id of is) if (!was.has(id)) writeLog(tx, now, { ...at, kind: "tag-added", to: id, note: name(id) });
  for (const id of was) if (!is.has(id)) writeLog(tx, now, { ...at, kind: "tag-removed", from: id, note: name(id) });
}

/** Sets the tags on one task, or on one event's overlay (so they survive imports). */
export const tagsSet = defineCommand("tags.set", (tx: Tx, input: TagsSetInput) => {
  const now = requireNow(tx, input);
  const id = requireText(tx, input.id, input.target === "task" ? "The task" : "The engagement");
  if (!Array.isArray(input.tags)) tx.fail("The tags must be a list.");
  const live = new Set(tx.list("tags").map((t) => t.id));
  const tags = [...new Set(input.tags)].filter((t) => live.has(t)).join(",");
  if (input.target === "task") {
    const task = tx.get("tasks", id);
    if (!task || task._deleted) tx.fail("That task has been removed.");
    tx.put("tasks", id, { tags });
    logTags(tx, now, task.tags, tags, { area: "task", principal: task.principal ?? "", task: id });
    return;
  }
  const event = tx.get("events", id);
  if (!event || event._deleted) tx.fail("That engagement hasn't arrived on this computer yet.");
  const oid = overlayId(tx, id);
  const current = tx.get("overlays", oid);
  if (current?._deleted) tx.restore("overlays", oid);
  tx.put("overlays", oid, current ? { tags } : { event: id, prep: "none", flagged: false, tags });
  logTags(tx, now, current?._deleted ? "" : current?.tags, tags, { area: "overlay", principal: event.principal ?? "", event: id });
  // Tags trigger tab templates (OUT-88).
  const before = current && !current._deleted ? tagIdsOf(current.tags) : [];
  const after = tags === "" ? [] : tags.split(",");
  applyTriggeredTabs(tx, now, event, "tag", after.filter((t) => !before.includes(t)), "tag");
  releaseTriggeredTabs(tx, now, event, "tag", before.filter((t) => !after.includes(t)));
});

/** Sets an Outlook category's colour or order. Its name comes from Outlook, so it can't be changed here. */
export const categorySave = defineCommand("category.save", (tx: Tx, input: CategorySaveInput) => {
  requireNow(tx, input);
  const id = requireText(tx, input.id, "The category");
  const current = tx.get("categories", id);
  if (!current || current._deleted) tx.fail("That category hasn't arrived on this computer yet.");
  const colour = checkColour(tx, input.colour);
  if (input.order !== undefined && (typeof input.order !== "number" || !Number.isFinite(input.order))) tx.fail("The order must be a number.");
  tx.put("categories", id, { ...(colour !== undefined && { colour }), ...(input.order !== undefined && { order: input.order }) });
});
