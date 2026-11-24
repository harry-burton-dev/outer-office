// import.apply: a confirmed diff into `events`. Each event is checked again
// against what is stored when the command runs, so applying a diff twice, or
// on two computers, lands on one set of events. Overlays and tasks are never
// touched, except that a future occurrence an import adds takes its series'
// tags, Quiet and priority (D8).
import { defineCommand, type RowOf, type Tx } from "@trellis/framework";
import type { ImportDiff, ImportedEvent, StoredEvent } from "../../import/types";
import { isIsoInstant, requireNow, requireText, writeLog } from "./shared";
import { settleProposals } from "./proposals";
import { HISTORY_SKIPS, V3_FIELDS, fieldChanges, valueOf, type ComparedField } from "../../import/compare";
import { TAG_COLOURS } from "../tags";
import { applyRekeys, pairedIds } from "./rekey";
import { overlayId } from "./overlay";
import { applySeriesValues, NO_SERIES_VALUES, seriesOverlayId } from "./series-overlay";

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
/** "filled" writes fields the stored row never had (import/compare.ts): not a change to the meeting, so no calendar log row. */
type Kind = "added" | "moved" | "changed" | "returned" | "filled";

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
  if (diff.filled !== undefined && !Array.isArray(diff.filled)) tx.fail("The import is incomplete. Read the file again.");
  checkRekeys(tx, diff);
  const incoming = [...diff.added, ...diff.changed.map((c) => c.after), ...(diff.filled ?? []).map((c) => c.after), ...diff.returned.map((c) => c.after)];
  for (const event of incoming) {
    const problem = badEvent(event);
    if (problem) tx.fail(`The file could not be applied: ${problem}.`);
  }
  const badGone = diff.gone.some((e) => e === null || typeof e !== "object" || typeof e.uid !== "string" || e.uid === "" || typeof e.recurrenceId !== "string");
  if (badGone) tx.fail("The file could not be applied: an event to mark gone has no UID.");
}

/** A re-key pairs an old occurrence the diff marks gone with a new one it adds, in one series. */
function checkRekeys(tx: Tx, diff: ImportDiff): void {
  if (diff.rekeys === undefined) return;
  if (!Array.isArray(diff.rekeys)) tx.fail("The import is incomplete. Read the file again.");
  const key = (e: { uid?: unknown; recurrenceId?: unknown }) => `${String(e?.uid)}\n${String(e?.recurrenceId)}`;
  const [gone, added] = [new Set(diff.gone.map(key)), new Set(diff.added.map(key))];
  for (const rekey of diff.rekeys) {
    const pairs = Array.isArray(rekey?.pairs) ? rekey.pairs : null;
    if (!pairs || typeof rekey.ambiguous !== "boolean") tx.fail("The import is incomplete. Read the file again.");
    if (rekey.ambiguous) continue;
    for (const p of pairs) {
      if (!gone.has(key(p?.from)) || !added.has(key(p?.to))) tx.fail("The file could not be applied: a series change pairs a meeting that isn't in the import.");
    }
  }
}

const isOlder = (incoming: string, stored: string | undefined) =>
  stored !== undefined && stored !== "" && Date.parse(incoming) < Date.parse(stored);

/** What applying one incoming event does to the stored one, or undefined when nothing changes. */
function planEvent(stored: StoredRow | undefined, event: ImportedEvent): { kind: Kind; fields: readonly ComparedField[] } | undefined {
  if (!stored) return { kind: "added", fields: [] };
  if (isOlder(event.sourceModified, stored.sourceModified)) return undefined;
  const { changed, filled } = fieldChanges(stored as Partial<ImportedEvent>, event);
  const fields = [...changed, ...filled];
  if (stored.gone) return { kind: "returned", fields };
  if (fields.length === 0) return undefined;
  if (changed.length === 0) return { kind: "filled", fields };
  return { kind: changed.includes("start") ? "moved" : "changed", fields };
}

/** Fields a source may leave out; each keeps what an earlier import stored. */
const KEPT = ["requiredAttendees", "optionalAttendees", "importance", "sensitivity", "created", "source", "raw", ...V3_FIELDS] as const;

/** A field the source does not carry keeps what an earlier import stored. */
function eventFields(event: ImportedEvent, stored: StoredRow | undefined, principal: string, importId: string, moves: number) {
  const { uid, recurrenceId, start, end, allDay, subject, location, organizer, categories, showAs, masked, sourceModified } = event;
  const kept: Record<string, unknown> = {};
  for (const key of KEPT) {
    const value = event[key] ?? stored?.[key];
    if (value !== undefined) kept[key] = value;
    else if (key !== "source") kept[key] = valueOf({}, key as ComparedField);
  }
  if (kept.source === undefined) kept.source = "";
  return {
    principal, uid, recurrenceId, start, end, allDay, subject, location, organizer, categories, showAs, masked, sourceModified,
    ...(kept as Pick<StoredRow, (typeof KEPT)[number]>), gone: false, moves, importId,
  };
}

/** One history row per changed field (OUT-83). The body's text is never copied (D7). */
function writeHistory(tx: Tx, now: string, id: string, importId: string, stored: StoredRow, event: ImportedEvent, fields: readonly ComparedField[]): void {
  for (const field of fields) {
    if (HISTORY_SKIPS.has(field)) continue;
    const secret = field === "body";
    tx.put("eventHistory", tx.newId(), {
      event: id, at: now, importId, source: event.source ?? "", field,
      from: secret ? "" : String(valueOf(stored as Partial<ImportedEvent>, field)), to: secret ? "" : String(valueOf(event, field)),
    });
  }
}

/** What this run wrote for one event, since tx reads don't see the run's own writes. */
interface Written { seriesId: string; start: string; gone: boolean; kind: string; subject: string; organizer: string }

function applyIncoming(tx: Tx, now: string, principal: string, importId: string, event: ImportedEvent, written: Map<string, Written>, quiet: ReadonlySet<string>): Kind | undefined {
  const id = eventId(tx, principal, event);
  const stored = tx.get("events", id);
  const plan = planEvent(stored, event);
  if (!plan) return undefined;
  if (stored?._deleted) tx.restore("events", id);
  const moved = stored !== undefined && stored.start !== event.start;
  const fields = eventFields(event, stored, principal, importId, (stored?.moves ?? 0) + (moved ? 1 : 0));
  tx.put("events", id, fields);
  written.set(id, { seriesId: fields.seriesId ?? "", start: event.start, gone: false, kind: fields.kind ?? "", subject: event.subject, organizer: event.organizer });
  if (stored && !stored._deleted) writeHistory(tx, now, id, importId, stored, event, plan.fields);
  if (plan.kind === "filled" || quiet.has(id)) return plan.kind;
  const others = plan.fields.filter((field) => field !== "start");
  const note = others.length > 0 ? `Changed: ${others.join(", ")}` : "";
  const fromTo = moved ? { from: stored?.start ?? "", to: event.start } : {};
  writeLog(tx, now, { area: "calendar", kind: plan.kind, principal, event: id, note, ...fromTo });
  return plan.kind;
}

/** A category record for each name first seen (OUT-83). Masked items carry none. */
function recordCategories(tx: Tx, now: string, events: readonly ImportedEvent[]): void {
  const known = new Set(tx.list("categories", { includeDeleted: true }).map((c) => c.id));
  let order = tx.list("categories").length;
  for (const event of events) {
    if (event.masked) continue;
    for (const name of event.categories.split(",").map((c) => c.trim()).filter(Boolean)) {
      const id = tx.id("category", name.toLowerCase());
      if (known.has(id)) continue;
      known.add(id);
      tx.put("categories", id, { name, colour: TAG_COLOURS[order % TAG_COLOURS.length]?.value ?? "", order, firstSeen: now });
      order += 1;
    }
  }
}

/**
 * An occurrence gone from Outlook while its series goes on was cancelled
 * there: its overlay's archive reason says so (v0.3-brief.md section 4). A
 * reason the office already gave is kept.
 */
function markCancelled(tx: Tx, eventId: string): void {
  const oid = overlayId(tx, eventId);
  const overlay = tx.get("overlays", oid);
  if (overlay && !overlay._deleted && overlay.archiveReason) return;
  if (overlay?._deleted) tx.restore("overlays", oid);
  tx.put("overlays", oid, overlay && !overlay._deleted ? { archiveReason: "cancelled" } : { event: eventId, prep: "none", flagged: false, archiveReason: "cancelled" });
}

/**
 * Works out the series record of every series this run touched, from its
 * stored occurrences as they stand after the run. An exception is an
 * occurrence Outlook marks as one, or a gone occurrence with a later one still
 * in the diary (v0.3-brief.md section 4).
 */
function recordSeries(tx: Tx, principal: string, written: ReadonlyMap<string, Written>, quiet: ReadonlySet<string>): void {
  const touched = new Set([...written.values()].map((w) => w.seriesId).filter(Boolean));
  if (touched.size === 0) return;
  const rows = new Map<string, Written>();
  for (const e of tx.list("events")) {
    if (e.principal !== principal || !touched.has(e.seriesId ?? "")) continue;
    rows.set(e.id, { seriesId: e.seriesId ?? "", start: e.start ?? "", gone: e.gone === true, kind: e.kind ?? "", subject: e.subject ?? "", organizer: e.organizer ?? "" });
  }
  for (const [id, w] of written) if (touched.has(w.seriesId)) rows.set(id, { ...rows.get(id), ...w });
  // An occurrence a re-key replaced is no longer part of its series.
  for (const id of quiet) if (rows.get(id)?.gone) rows.delete(id);
  for (const seriesId of touched) {
    const all = [...rows.values()].filter((r) => r.seriesId === seriesId).sort((a, b) => a.start.localeCompare(b.start));
    const live = all.filter((r) => !r.gone);
    const lastLive = live.at(-1)?.start ?? "";
    const exceptions = live.filter((r) => r.kind === "exception").length + all.filter((r) => r.gone && r.start < lastLive).length;
    const latest = live.at(-1) ?? all.at(-1);
    for (const [id, w] of written) if (w.seriesId === seriesId && w.gone && w.start < lastLive && !quiet.has(id)) markCancelled(tx, id);
    tx.put("series", tx.id("series", principal, seriesId), {
      principal, seriesId, subject: latest?.subject ?? "", organizer: latest?.organizer ?? "", pattern: "",
      firstStart: live[0]?.start ?? "", lastStart: lastLive, count: live.length, exceptions,
    });
  }
}

/**
 * A future occurrence this run added takes its series' values (D8). One a
 * re-key pairs is left alone: it takes its old engagement's overlay instead.
 */
function applySeriesOverlays(tx: Tx, now: string, principal: string, added: readonly ImportedEvent[], written: ReadonlyMap<string, Written>, rekeyed: ReadonlySet<string>): void {
  for (const event of added) {
    const id = eventId(tx, principal, event);
    const seriesId = written.get(id)?.seriesId ?? "";
    if (seriesId === "" || event.start < now || rekeyed.has(id)) continue;
    const values = tx.get("seriesOverlays", seriesOverlayId(tx, principal, seriesId));
    if (!values || values._deleted) continue;
    applySeriesValues(tx, id, NO_SERIES_VALUES, { tags: values.tags ?? "", quiet: values.quiet ?? false, priority: values.priority ?? 4 });
  }
}

function applyGone(tx: Tx, now: string, principal: string, importId: string, event: StoredEvent, written: Map<string, Written>, quiet: ReadonlySet<string>): boolean {
  const id = eventId(tx, principal, event);
  const stored = tx.get("events", id);
  if (!stored || stored._deleted || stored.gone) return false;
  tx.put("events", id, { gone: true, importId });
  written.set(id, { seriesId: stored.seriesId ?? "", start: stored.start ?? "", gone: true, kind: stored.kind ?? "", subject: stored.subject ?? "", organizer: stored.organizer ?? "" });
  if (!quiet.has(id)) writeLog(tx, now, { area: "calendar", kind: "gone", principal, event: id, from: stored.start ?? "" });
  return true;
}

/** Incoming events once each, by id; a later copy of one event wins. */
function incomingOf(tx: Tx, principal: string, diff: ImportDiff): readonly ImportedEvent[] {
  const all = [...diff.added, ...diff.changed.map((c) => c.after), ...(diff.filled ?? []).map((c) => c.after), ...diff.returned.map((c) => c.after)];
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
  const incoming = incomingOf(tx, principal, input.diff);
  const written = new Map<string, Written>();
  const idOf = (e: { uid: string; recurrenceId: string }) => eventId(tx, principal, e);
  const quiet = pairedIds(input.diff.rekeys, idOf);
  const kinds = incoming.map((event) => applyIncoming(tx, now, principal, importId, event, written, quiet));
  const gone = input.diff.gone.filter((event) => applyGone(tx, now, principal, importId, event, written, quiet)).length;
  applyRekeys(tx, now, principal, input.diff.rekeys ?? [], idOf);
  recordCategories(tx, now, incoming);
  recordSeries(tx, principal, written, quiet);
  applySeriesOverlays(tx, now, principal, incoming.filter((_, i) => kinds[i] === "added"), written, quiet);
  const count = (kind: Kind) => kinds.filter((k) => k === kind).length;
  const result = { importId, added: count("added"), changed: count("changed") + count("moved"), gone, returned: count("returned") };
  const { rangeStart, rangeEnd } = input.diff;
  tx.put("imports", importId, { principal, at: now, by: tx.user, rangeStart, rangeEnd, added: result.added, changed: result.changed + result.returned, gone });
  writeLog(tx, now, {
    area: "import", kind: "applied", principal,
    note: `${file || "Import"}: ${result.added} added, ${result.changed} changed, ${gone} gone, ${result.returned} returned`,
  });
  // Proposals Outlook now shows are done.
  const landed = incoming.map((e) => ({ id: eventId(tx, principal, e), start: e.start, end: e.end, subject: e.subject }));
  settleProposals(tx, now, principal, landed, new Set(input.diff.gone.map((e) => eventId(tx, principal, e))));
  return result;
});
