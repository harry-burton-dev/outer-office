// import.apply: a confirmed diff into `events`. Each event is checked again
// against what is stored when the command runs, so applying a diff twice, or
// on two computers, lands on one set of events. Overlays and tasks are never
// touched.
import { defineCommand, type RowOf, type Tx } from "@trellis/framework";
import type { ImportDiff, ImportedEvent, StoredEvent } from "../../import/types";
import { isIsoInstant, requireNow, requireText, writeLog } from "./shared";

export interface ImportApplyInput {
  now: string;
  /** The principal id. */
  principal: string;
  /** The .ics file's name, for the log. */
  file: string;
  diff: ImportDiff;
}

export interface ImportResult {
  importId: string;
  added: number;
  changed: number;
  gone: number;
  returned: number;
}

type StoredRow = RowOf<"events">;
type Kind = "added" | "moved" | "changed" | "returned";

const COMPARED = ["start", "end", "allDay", "subject", "location", "organizer", "categories", "showAs", "masked"] as const;

/**
 * tx.id("event", principal, uid, recurrenceId). tx.id refuses an empty part, so
 * a single event (empty recurrenceId) leaves that part out.
 */
export const eventId = (tx: Tx, principal: string, event: Pick<ImportedEvent, "uid" | "recurrenceId">): string =>
  event.recurrenceId === "" ? tx.id("event", principal, event.uid) : tx.id("event", principal, event.uid, event.recurrenceId);

function badEvent(event: ImportedEvent): string | null {
  if (event === null || typeof event !== "object") return "an event is missing";
  if (typeof event.uid !== "string" || event.uid === "") return "an event has no UID";
  if (typeof event.recurrenceId !== "string") return `event ${event.uid} has a bad recurrence id`;
  if (!isIsoInstant(event.start) || !isIsoInstant(event.end)) return `event ${event.uid} has a bad start or end`;
  if (typeof event.sourceModified !== "string") return `event ${event.uid} has no last-modified time`;
  const texts = [event.subject, event.location, event.organizer, event.categories, event.showAs];
  if (texts.some((t) => typeof t !== "string") || typeof event.allDay !== "boolean" || typeof event.masked !== "boolean") return `event ${event.uid} has a field of the wrong kind`;
  return null;
}

function checkDiff(tx: Tx, diff: ImportDiff): void {
  if (diff === null || typeof diff !== "object") tx.fail("There is no import to apply.");
  const lists = [diff.added, diff.changed, diff.gone, diff.returned];
  if (lists.some((list) => !Array.isArray(list))) tx.fail("The import is incomplete. Read the file again.");
  if (!isIsoInstant(diff.rangeStart) || !isIsoInstant(diff.rangeEnd) || diff.rangeStart > diff.rangeEnd) tx.fail("The import's date range is not valid. Read the file again.");
  const incoming = [...diff.added, ...diff.changed.map((c) => c.after), ...diff.returned.map((c) => c.after)];
  for (const event of incoming) {
    const problem = badEvent(event);
    if (problem) tx.fail(`The file could not be applied: ${problem}.`);
  }
  const badGone = diff.gone.some((e) => e === null || typeof e !== "object" || typeof e.uid !== "string" || e.uid === "" || typeof e.recurrenceId !== "string");
  if (badGone) tx.fail("The file could not be applied: an event to mark gone has no UID.");
}

const isOlder = (incoming: string, stored: string | undefined) =>
  stored !== undefined && stored !== "" && Date.parse(incoming) < Date.parse(stored);

/** What applying one incoming event does to the stored one, or undefined when nothing changes. */
function planEvent(stored: StoredRow | undefined, event: ImportedEvent): { kind: Kind; fields: readonly string[] } | undefined {
  if (!stored) return { kind: "added", fields: [] };
  if (isOlder(event.sourceModified, stored.sourceModified)) return undefined;
  const fields = COMPARED.filter((key) => stored[key] !== event[key]);
  if (stored.gone) return { kind: "returned", fields };
  if (fields.length === 0) return undefined;
  return { kind: fields.includes("start") ? "moved" : "changed", fields };
}

function eventFields(event: ImportedEvent, principal: string, importId: string, moves: number) {
  const { uid, recurrenceId, start, end, allDay, subject, location, organizer, categories, showAs, masked, sourceModified } = event;
  return { principal, uid, recurrenceId, start, end, allDay, subject, location, organizer, categories, showAs, masked, sourceModified, gone: false, moves, importId };
}

function applyIncoming(tx: Tx, now: string, principal: string, importId: string, event: ImportedEvent): Kind | undefined {
  const id = eventId(tx, principal, event);
  const stored = tx.get("events", id);
  const plan = planEvent(stored, event);
  if (!plan) return undefined;
  if (stored?._deleted) tx.restore("events", id);
  const moved = stored !== undefined && stored.start !== event.start;
  tx.put("events", id, eventFields(event, principal, importId, (stored?.moves ?? 0) + (moved ? 1 : 0)));
  const others = plan.fields.filter((field) => field !== "start");
  const note = others.length > 0 ? `Changed: ${others.join(", ")}` : "";
  const fromTo = moved ? { from: stored?.start ?? "", to: event.start } : {};
  writeLog(tx, now, { area: "calendar", kind: plan.kind, principal, event: id, note, ...fromTo });
  return plan.kind;
}

function applyGone(tx: Tx, now: string, principal: string, importId: string, event: StoredEvent): boolean {
  const id = eventId(tx, principal, event);
  const stored = tx.get("events", id);
  if (!stored || stored._deleted || stored.gone) return false;
  tx.put("events", id, { gone: true, importId });
  writeLog(tx, now, { area: "calendar", kind: "gone", principal, event: id, from: stored.start ?? "" });
  return true;
}

/** Incoming events once each, by id; a later copy of one event wins. */
function incomingOf(tx: Tx, principal: string, diff: ImportDiff): readonly ImportedEvent[] {
  const all = [...diff.added, ...diff.changed.map((c) => c.after), ...diff.returned.map((c) => c.after)];
  return [...new Map(all.map((event) => [eventId(tx, principal, event), event])).values()];
}

export const importApply = defineCommand("import.apply", (tx: Tx, input: ImportApplyInput): ImportResult => {
  const now = requireNow(tx, input);
  const principal = requireText(tx, input.principal, "The principal");
  const found = tx.get("principals", principal);
  if (!found || found._deleted) tx.fail("That principal no longer exists. Choose another before importing.");
  const file = typeof input.file === "string" ? input.file : "";
  checkDiff(tx, input.diff);
  const importId = tx.newId();
  const kinds = incomingOf(tx, principal, input.diff).map((event) => applyIncoming(tx, now, principal, importId, event));
  const gone = input.diff.gone.filter((event) => applyGone(tx, now, principal, importId, event)).length;
  const count = (kind: Kind) => kinds.filter((k) => k === kind).length;
  const result = { importId, added: count("added"), changed: count("changed") + count("moved"), gone, returned: count("returned") };
  const { rangeStart, rangeEnd } = input.diff;
  tx.put("imports", importId, { principal, at: now, by: tx.user, rangeStart, rangeEnd, added: result.added, changed: result.changed + result.returned, gone });
  writeLog(tx, now, {
    area: "import", kind: "applied", principal,
    note: `${file || "Import"}: ${result.added} added, ${result.changed} changed, ${gone} gone, ${result.returned} returned`,
  });
  return result;
});
