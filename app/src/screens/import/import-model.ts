// Pure pieces of the Import screen: the parse window, stored rows as the diff
// wants them, the counts line and the table of changes. Nothing here reads hooks.
import type { RowOf } from "@trellis/framework";
import type { EventChange, ImportDiff, ImportedEvent, StoredEvent } from "@/import/types";
import { formatDay, formatTime } from "@/domain/dates";

export type EventRow = RowOf<"events">;
export type OverlayRow = RowOf<"overlays">;
export type TaskRow = RowOf<"tasks">;
export type PrivatePolicy = "drop" | "mask";

const MONTHS_BACK = 6;
const MONTHS_FORWARD = 12;
export const CHANGE_ROW_CAP = 50;

const shiftMonths = (iso: string, months: number): string => {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())).toISOString();
};

/** 6 months back to 12 months forward of now. */
export function importWindow(now: string): { windowStart: string; windowEnd: string } {
  return { windowStart: shiftMonths(now, -MONTHS_BACK), windowEnd: shiftMonths(now, MONTHS_FORWARD) };
}

/** The stored rows of one principal as the diff expects them; missing fields become empty. */
export function toStored(rows: readonly EventRow[], principal: string): StoredEvent[] {
  return rows
    .filter((r) => !r._deleted && r.principal === principal && typeof r.uid === "string" && r.uid !== "")
    .map((r) => ({
      id: r.id, principal, uid: r.uid ?? "", recurrenceId: r.recurrenceId ?? "", start: r.start ?? "", end: r.end ?? "",
      allDay: r.allDay === true, subject: r.subject ?? "", location: r.location ?? "", organizer: r.organizer ?? "",
      categories: r.categories ?? "", showAs: r.showAs ?? "", masked: r.masked === true, sourceModified: r.sourceModified ?? "",
      gone: r.gone === true, moves: r.moves ?? 0,
    }));
}

export const changesAnything = (diff: ImportDiff): boolean =>
  diff.added.length + diff.changed.length + diff.gone.length + diff.returned.length > 0;

/** One plain line: every count the review shows. */
export function countsLine(diff: ImportDiff, policy: PrivatePolicy): string {
  const moved = diff.changed.filter((c) => c.moved).length;
  const privateCount = policy === "drop" ? `${diff.droppedPrivate} private dropped` : `${diff.maskedPrivate} private masked`;
  return [
    `${diff.added.length} added`, `${moved} moved`, `${diff.changed.length - moved} changed`, `${diff.gone.length} gone`,
    `${diff.returned.length} returned`, `${diff.unchanged} unchanged`, `${diff.skippedOlder} skipped as older`, privateCount,
  ].join(", ");
}

/** "Tue 24 Nov 14:00", or the day alone for an all-day event. */
export function whenText(event: Pick<ImportedEvent, "start" | "allDay">, zone: string): string {
  if (event.start === "" || Number.isNaN(Date.parse(event.start))) return "";
  return event.allDay ? formatDay(event.start, zone) : `${formatDay(event.start, zone)} ${formatTime(event.start, zone)}`;
}

export type ChangeKind = "Gone" | "Moved" | "Returned" | "Changed" | "Added";

export interface ChangeRow {
  key: string;
  kind: ChangeKind;
  subject: string;
  was: string;
  now: string;
  /** "has notes", "1 task": office data on a gone or moved event, or "". */
  officeData: string;
}

const SHOWN_FIELDS = ["subject", "location", "organizer", "categories", "showAs", "end", "allDay", "masked"] as const;
type ShownField = (typeof SHOWN_FIELDS)[number];

function fieldText(field: ShownField, event: ImportedEvent, zone: string): string {
  if (field === "end") return event.end === "" ? "" : `ends ${formatTime(event.end, zone)}`;
  if (field === "allDay") return event.allDay ? "all day" : "timed";
  if (field === "masked") return event.masked ? "private" : "not private";
  return event[field];
}

function detailText(change: EventChange, side: "before" | "after", zone: string): string {
  const fields = SHOWN_FIELDS.filter((f) => change.fields.includes(f));
  return fields.map((f) => fieldText(f, change[side], zone)).filter((t) => t !== "").join(", ");
}

export interface OfficeData {
  overlays: readonly OverlayRow[];
  tasks: readonly TaskRow[];
}

const hasNotes = (o: OverlayRow): boolean =>
  Boolean(o.notes?.trim()) || Boolean(o.outcome?.trim()) || o.flagged === true || (o.prep ?? "none") !== "none";

/** A few words on the overlay and linked tasks an event has, or "". */
export function officeDataText(eventId: string, data: OfficeData): string {
  const notes = data.overlays.some((o) => !o._deleted && o.event === eventId && hasNotes(o));
  const tasks = data.tasks.filter((t) => !t._deleted && t.event === eventId).length;
  return [notes ? "has notes" : "", tasks === 0 ? "" : tasks === 1 ? "1 task" : `${tasks} tasks`].filter(Boolean).join(", ");
}

const keyOf = (e: Pick<ImportedEvent, "uid" | "recurrenceId">) => `${e.uid}\n${e.recurrenceId}`;

/** The changes that matter, in order: gone, moved, returned, changed, added. */
export function changeRows(diff: ImportDiff, zone: string, data: OfficeData): ChangeRow[] {
  const gone = diff.gone.map((e): ChangeRow => ({
    key: `gone ${keyOf(e)}`, kind: "Gone", subject: e.subject, was: whenText(e, zone), now: "", officeData: officeDataText(e.id, data),
  }));
  const moved = diff.changed.filter((c) => c.moved).map((c): ChangeRow => ({
    key: `moved ${keyOf(c.after)}`, kind: "Moved", subject: c.after.subject, was: whenText(c.before, zone), now: whenText(c.after, zone),
    officeData: officeDataText(c.before.id, data),
  }));
  const returned = diff.returned.map((c): ChangeRow => ({
    key: `returned ${keyOf(c.after)}`, kind: "Returned", subject: c.after.subject, was: "gone", now: whenText(c.after, zone), officeData: "",
  }));
  const changed = diff.changed.filter((c) => !c.moved).map((c): ChangeRow => ({
    key: `changed ${keyOf(c.after)}`, kind: "Changed", subject: c.after.subject, was: detailText(c, "before", zone), now: detailText(c, "after", zone), officeData: "",
  }));
  const added = diff.added.map((e): ChangeRow => ({
    key: `added ${keyOf(e)}`, kind: "Added", subject: e.subject, was: "", now: whenText(e, zone), officeData: "",
  }));
  return [...gone, ...moved, ...returned, ...changed, ...added];
}
