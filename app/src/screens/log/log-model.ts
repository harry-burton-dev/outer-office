// Pure pieces of the Log screen: areas, kinds in plain words, values shown
// as dates, and which rows to show. Nothing here reads hooks.
import type { RowOf } from "@trellis/framework";
import { formatDay, formatTime } from "@/domain/dates";

export type LogRow = RowOf<"log">;

export const PAGE_SIZE = 200;

export const AREAS = [
  { value: "all", label: "All" },
  { value: "calendar", label: "Calendar" },
  { value: "overlay", label: "Overlay" },
  { value: "task", label: "Task" },
  { value: "import", label: "Import" },
  { value: "setup", label: "Setup" },
  { value: "proposal", label: "Proposal" },
] as const;

export type AreaFilter = (typeof AREAS)[number]["value"];

const KIND_WORDS: Readonly<Record<string, string>> = {
  added: "Added", moved: "Moved", changed: "Changed", gone: "Gone", returned: "Returned", applied: "Import applied",
  prep: "Prep changed", flag: "Flag changed",
  created: "Created", edited: "Edited", completed: "Completed", reopened: "Reopened", removed: "Moved to bin",
  restored: "Restored", linked: "Linked", unlinked: "Unlinked",
  assigned: "Assigned", accepted: "Accepted", declined: "Declined", recalled: "Recalled",
  "office-created": "Office set up", "office-changed": "Office changed",
  "principal-added": "Principal added", "principal-changed": "Principal changed",
  move: "Move proposed", withdraw: "Proposal withdrawn", new: "Meeting proposed", settled: "Found in Outlook",
  archived: "Archived", unarchived: "Back from the archive",
};

/** A log kind in plain words: "prep" is "Prep changed"; an unknown kind is tidied. */
export function kindText(kind: string | undefined): string {
  if (!kind) return "";
  const known = KIND_WORDS[kind];
  if (known) return known;
  const words = kind.replace(/[-_.]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const AREA_LABEL: Readonly<Record<string, string>> = Object.fromEntries(AREAS.map((a) => [a.value, a.label]));

export const areaText = (area: string | undefined): string => (area ? (AREA_LABEL[area] ?? area) : "");

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** An instant as "Tue 24 Nov 14:00", a date as "Tue 24 Nov", true/false as yes/no, anything else as it is. */
export function valueText(value: string | undefined, zone: string): string {
  if (!value) return "";
  if (DATE_ONLY.test(value)) return formatDay(`${value}T12:00:00Z`, "UTC");
  if (ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value))) return `${formatDay(value, zone)} ${formatTime(value, zone)}`;
  if (value === "true") return "yes";
  if (value === "false") return "no";
  return value;
}

/** The principal's rows in an area, newest first. */
export function logRowsFor(rows: readonly LogRow[], principal: string, area: AreaFilter): LogRow[] {
  return rows
    .filter((r) => !r._deleted && r.principal === principal && (area === "all" || r.area === area))
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "") || b.id.localeCompare(a.id));
}
