// Tags: the office's own labels with a colour, shared by tasks and events.
// An event carries the tags set on its overlay, plus any tag whose name
// matches one of its Outlook categories, so categories set in Outlook show
// up without anyone tagging by hand. The first of the overlay's (or task's)
// own tags is the primary one: it comes first and gives the colour.
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

/** `list` with the tag `primary` moved to the front, when it is there. */
const primaryFirst = (list: Tag[], primary: string | undefined): Tag[] => {
  const lead = list.find((t) => t.id === primary);
  return lead ? [lead, ...list.filter((t) => t !== lead)] : list;
};

/** The tags on an event: its own and those named by its Outlook categories, the primary first, then in tag order, without repeats. */
export function eventTags(categories: string | undefined, own: string | undefined, tags: readonly Tag[]): Tag[] {
  const ownIds = tagIdsOf(own);
  const named = new Set((categories ?? "").split(",").map(key).filter(Boolean));
  const ids = new Set(ownIds);
  return primaryFirst(sortedTags(tags).filter((t) => ids.has(t.id) || named.has(key(t.name ?? ""))), ownIds[0]);
}

/** The tags on a task: the primary first, then in tag order. */
export function taskTags(own: string | undefined, tags: readonly Tag[]): Tag[] {
  const ownIds = tagIdsOf(own);
  const ids = new Set(ownIds);
  return primaryFirst(sortedTags(tags).filter((t) => ids.has(t.id)), ownIds[0]);
}

/** Own tag ids with `primary` first. A tag carried only through a category joins the own tags, so it can lead. */
export const makePrimary = (own: string | undefined, primary: string): string[] => [primary, ...tagIdsOf(own).filter((id) => id !== primary)];

/** True when the event has this tag only through an Outlook category, so it can't be taken off here. */
export const fromCategory = (tag: Tag, categories: string | undefined): boolean =>
  (categories ?? "").split(",").map(key).includes(key(tag.name ?? ""));
