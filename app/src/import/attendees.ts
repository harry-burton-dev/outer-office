// The structured attendee list (events v3 `attendees`) and the text lines that
// v2 stored, "Name <address> · response", one per line. Pure.
import type { Attendee } from "./types";

const LINE = /^(?:(.*?)\s*<([^<>]*)>|([^·]*?))\s*(?:·\s*(.*))?$/;

/** One v2 text line as an attendee. A bare value with an @ is an address, else a name. */
function fromLine(line: string, type: Attendee["type"]): Attendee | null {
  const m = LINE.exec(line.trim());
  if (!m || line.trim() === "") return null;
  const bare = (m[3] ?? "").trim();
  const name = m[2] !== undefined ? (m[1] ?? "").trim() : bare.includes("@") ? "" : bare;
  const address = m[2] !== undefined ? m[2].trim() : bare.includes("@") ? bare : "";
  return { name, address, type, response: (m[4] ?? "").trim(), respondedAt: "" };
}

/** v2's two text fields as the v3 list: required first, then optional. */
export function attendeesFromLines(required: string, optional: string): Attendee[] {
  const read = (text: string, type: Attendee["type"]) =>
    text.split("\n").map((line) => fromLine(line, type)).filter((a): a is Attendee => a !== null);
  return [...read(required, "required"), ...read(optional, "optional")];
}

/** One attendee as a v2 text line. */
export function lineOf(a: Attendee): string {
  const who = a.name && a.address && a.name !== a.address ? `${a.name} <${a.address}>` : a.address || a.name;
  return [who, a.response].filter(Boolean).join(" · ");
}

/** The v2 text fields, still written for the screens that read them. A resource (a room) reads as required, as Outlook lists it. */
export function linesOf(list: readonly Attendee[]): { requiredAttendees: string; optionalAttendees: string } {
  const lines = (optional: boolean) => list.filter((a) => (a.type === "optional") === optional).map(lineOf).filter(Boolean).join("\n");
  return { requiredAttendees: lines(false), optionalAttendees: lines(true) };
}

/** The stored JSON as a list; anything unreadable is an empty list. */
export function parseAttendees(json: string | undefined): Attendee[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? (value as Attendee[]) : [];
  } catch {
    return [];
  }
}
