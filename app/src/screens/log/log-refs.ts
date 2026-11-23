// A log row's From and To as people read them. Some rows store record ids
// there: a section for a task move, an event for a link or unlink, a user for
// an assignment. Those are shown by name; a record that has not arrived yet
// says so. Every other value goes through valueText. Pure: no hooks.
import { valueText, type LogRow } from "./log-model";

export const NOT_SYNCED = "not synced yet";

export interface LogLookups {
  sectionName(id: string): string | undefined;
  eventSubject(id: string): string | undefined;
  userName(id: string): string | undefined;
}

type RefKind = "section" | "event" | "user";

const ASSIGN_KINDS: ReadonlySet<string> = new Set(["assigned", "accepted", "declined", "recalled"]);
const NUMBER = /^-?\d+(\.\d+)?$/;

/** Which kind of record the row's From and To name, or null when they are plain values. */
export function refKindOf(row: Pick<LogRow, "area" | "kind">, value: string): RefKind | null {
  if (row.area !== "task") return null;
  if (row.kind === "moved") return NUMBER.test(value) ? null : "section";
  if (row.kind === "linked" || row.kind === "unlinked") return "event";
  if (row.kind && ASSIGN_KINDS.has(row.kind)) return "user";
  return null;
}

function lookUp(kind: RefKind, id: string, lookups: LogLookups): string | undefined {
  if (kind === "section") return lookups.sectionName(id);
  if (kind === "event") return lookups.eventSubject(id);
  return lookups.userName(id);
}

/** From or To for display: "" stays "", a record id becomes its name or "not synced yet". */
export function logValueText(row: Pick<LogRow, "area" | "kind">, value: string | undefined, lookups: LogLookups, zone: string): string {
  if (!value) return "";
  const kind = refKindOf(row, value);
  if (kind === null) return valueText(value, zone);
  return lookUp(kind, value, lookups) ?? NOT_SYNCED;
}
