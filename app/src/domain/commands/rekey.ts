// Moving office data with a series re-key (OUT-83, v0.3-brief.md section 4).
// import.apply calls this for each unambiguous re-key, after the new
// occurrences are written and the old ones marked gone. Everything the office
// added to an old occurrence moves to its pair, so nothing is left on a gone
// row. Imports never touch office data otherwise.
import type { Tx } from "@trellis/framework";
import type { SeriesRekey } from "../../import/rekey";
import { overlayId } from "./overlay";
import { proposalId } from "./proposals";
import { tabId } from "./cards";
import { writeLog } from "./shared";

type Row = Record<string, unknown> & { id: string; _deleted?: boolean; _conflicts?: unknown };

/** Writes a record's fields under a new id and removes the old one. */
function moveRecord(tx: Tx, table: "overlays" | "proposals" | "tabs", row: Row, toId: string, changes: Record<string, unknown>): void {
  const { id: _id, _deleted, _conflicts, ...fields } = row;
  if (tx.get(table, toId)?._deleted) tx.restore(table, toId);
  tx.put(table, toId, { ...fields, ...changes } as never);
  tx.remove(table, row.id);
}

/**
 * Moves everything keyed to an old event onto its new one, in one pass per
 * table, so a record touched twice (a moved overlay whose parent also moved)
 * is written once. Reads see the data as the run began.
 */
function moveAll(tx: Tx, moves: ReadonlyMap<string, string>): void {
  const to = (id: string | undefined) => (id !== undefined ? moves.get(id) : undefined);
  for (const o of tx.list("overlays")) {
    const [event, parent] = [to(o.event), to(o.parent)];
    if (event) moveRecord(tx, "overlays", o as Row, overlayId(tx, event), { event, ...(parent && { parent }) });
    else if (parent) tx.put("overlays", o.id, { parent });
  }
  for (const p of tx.list("proposals")) {
    const event = to(p.event);
    if (event && p.id === proposalId(tx, p.event ?? "")) moveRecord(tx, "proposals", p as Row, proposalId(tx, event), { event });
  }
  // A tab's id is keyed to its event (OUT-88), so it moves to a new id and its cards and tasks follow.
  const tabMoves = new Map<string, string>();
  for (const t of tx.list("tabs")) {
    const event = to(t.event);
    if (!event) continue;
    const toId = tabId(tx, event, t.tabTemplate ?? "");
    tabMoves.set(t.id, toId);
    moveRecord(tx, "tabs", t as Row, toId, { event });
  }
  const follow = (r: { event?: string; tab?: string }) => {
    const [event, tab] = [to(r.event), tabMoves.get(r.tab ?? "")];
    return event || tab ? { ...(event && { event }), ...(tab && { tab }) } : undefined;
  };
  for (const c of tx.list("cards")) { const changes = follow(c); if (changes) tx.put("cards", c.id, changes); }
  for (const t of tx.list("tasks")) { const changes = follow(t); if (changes) tx.put("tasks", t.id, changes); }
  for (const h of tx.list("eventHistory")) { const event = to(h.event); if (event) tx.put("eventHistory", h.id, { event }); }
}

/** Applies the unambiguous re-keys and writes one series-rekeyed log row for each series. */
export function applyRekeys(
  tx: Tx, now: string, principal: string, rekeys: readonly SeriesRekey[], idOf: (e: { uid: string; recurrenceId: string }) => string,
): void {
  const applied = rekeys.filter((r) => !r.ambiguous && r.pairs.length > 0);
  const moves = new Map(applied.flatMap((r) => r.pairs.map((p) => [idOf(p.from), idOf(p.to)] as const)));
  moveAll(tx, moves);
  // The replaced occurrence stays gone, but is no longer one of the series'.
  for (const from of moves.keys()) tx.put("events", from, { seriesId: "" });
  for (const rekey of applied) {
    const first = rekey.pairs[0]!;
    writeLog(tx, now, {
      area: "calendar", kind: "series-rekeyed", principal, event: idOf(first.to),
      from: first.from.start, to: first.to.start, note: `${rekey.subject}: ${rekey.pairs.length} occurrences moved with the series`,
    });
  }
}

/** The ids of every event paired by an unambiguous re-key, whose own added and gone log rows the import leaves out. */
export function pairedIds(rekeys: readonly SeriesRekey[] | undefined, idOf: (e: { uid: string; recurrenceId: string }) => string): Set<string> {
  return new Set((rekeys ?? []).filter((r) => !r.ambiguous).flatMap((r) => r.pairs.flatMap((p) => [idOf(p.from), idOf(p.to)])));
}
