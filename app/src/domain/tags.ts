// Tags: the office's own labels with a colour, shared by tasks and events.
// An event carries the tags set on its overlay, plus any tag whose name
// matches one of its Outlook categories, so categories set in Outlook show
// up without anyone tagging by hand.
import type { RowOf } from "@trellis/framework";

export type Tag = RowOf<"tags">;

/** The colours a tag can take. Distinct in light and dark, and readable under dark text. */
export const TAG_COLOURS: readonly { name: string; value: string }[] = [
  { name: "Red", value: "#f87171" },
  { name: "Orange", value: "#fb923c" },
  { name: "Amber", value: "#fbbf24" },
  { name: "Green", value: "#4ade80" },
  { name: "Teal", value: "#2dd4bf" },
  { name: "Sky", value: "#38bdf8" },
  { name: "Blue", value: "#818cf8" },
  { name: "Purple", value: "#c084fc" },
  { name: "Pink", value: "#f472b6" },
  { name: "Grey", value: "#a1a1aa" },
];

/** Tag ids from a stored comma-separated field. */
export const tagIdsOf = (field: string | undefined): string[] =>
  (field ?? "").split(",").map((id) => id.trim()).filter(Boolean);

/** Live tags in their order. */
export const sortedTags = (tags: readonly Tag[]): Tag[] =>
  tags.filter((t) => !t._deleted && (t.name ?? "") !== "").sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name ?? "").localeCompare(b.name ?? ""));

const key = (name: string): string => name.trim().toLowerCase();

/** The tags on an event: its own, then those named by its Outlook categories, in tag order, without repeats. */
export function eventTags(categories: string | undefined, own: string | undefined, tags: readonly Tag[]): Tag[] {
  const ownIds = new Set(tagIdsOf(own));
  const named = new Set((categories ?? "").split(",").map(key).filter(Boolean));
  return sortedTags(tags).filter((t) => ownIds.has(t.id) || named.has(key(t.name ?? "")));
}

/** The tags on a task, in tag order. */
export function taskTags(own: string | undefined, tags: readonly Tag[]): Tag[] {
  const ids = new Set(tagIdsOf(own));
  return sortedTags(tags).filter((t) => ids.has(t.id));
}

/** True when the event has this tag only through an Outlook category, so it can't be taken off here. */
export const fromCategory = (tag: Tag, categories: string | undefined): boolean =>
  (categories ?? "").split(",").map(key).includes(key(tag.name ?? ""));
