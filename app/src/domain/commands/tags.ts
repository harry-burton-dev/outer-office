// tag.save, tag.remove, tags.set: the office's tags, and which tags a task or event carries.
import { defineCommand, type Tx } from "@trellis/framework";
import { TAG_COLOURS, tagIdsOf } from "../tags";
import { overlayId } from "./overlay";
import { requireNow, requireText } from "./shared";

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

/** Sets the tags on one task, or on one event's overlay (so they survive imports). */
export const tagsSet = defineCommand("tags.set", (tx: Tx, input: TagsSetInput) => {
  requireNow(tx, input);
  const id = requireText(tx, input.id, input.target === "task" ? "The task" : "The engagement");
  if (!Array.isArray(input.tags)) tx.fail("The tags must be a list.");
  const live = new Set(tx.list("tags").map((t) => t.id));
  const tags = [...new Set(input.tags)].filter((t) => live.has(t)).join(",");
  if (input.target === "task") {
    const task = tx.get("tasks", id);
    if (!task || task._deleted) tx.fail("That task has been removed.");
    tx.put("tasks", id, { tags });
    return;
  }
  const event = tx.get("events", id);
  if (!event || event._deleted) tx.fail("That engagement hasn't arrived on this computer yet.");
  const oid = overlayId(tx, id);
  const current = tx.get("overlays", oid);
  if (current?._deleted) tx.restore("overlays", oid);
  tx.put("overlays", oid, current ? { tags } : { event: id, prep: "none", flagged: false, tags });
});
