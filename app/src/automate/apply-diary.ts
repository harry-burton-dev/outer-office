// Applies a diary update from Power Automate without a review (OO2 Q3): the
// sync is the primary source, so its result goes straight into `events`
// through the same diff and import.apply as an .ics file. A run that changes
// something leaves an import and a log entry; a run that changes nothing
// leaves neither. A payload the adapter refuses applies nothing and says why,
// and so does one that would mark most of the diary gone (OUT-81): an .ics
// import, where a person confirms it, settles that case.
import type { RowOf } from "@trellis/framework";
import { parseAutomate } from "@/import/parse-automate";
import { diffImport, marksMostGone, storedInRange } from "@/import/diff";
import { changesAnything, toStored, type PrivatePolicy } from "@/screens/import/import-model";
import type { ImportApplyInput } from "@/domain/commands/import";
import type { DiaryUpdate } from "./diary-inbox";

/** The log's name for a sync run. */
export const SYNC_FILE = "Power Automate sync";

export interface ApplyContext {
  principals: readonly RowOf<"principals">[];
  events: readonly RowOf<"events">[];
  timeZone: string;
  privatePolicy: PrivatePolicy;
  now: string;
  run(input: ImportApplyInput): { ok: true } | { ok: false; error: string };
}

/** applied and unchanged updates are used up; refused ones stay, with the reason. */
export type ApplyOutcome = { kind: "applied" } | { kind: "unchanged" } | { kind: "refused"; reason: string };

export function applyDiaryUpdate(update: DiaryUpdate, ctx: ApplyContext): ApplyOutcome {
  const principal = ctx.principals.find((p) => !p._deleted && p.code === update.principal);
  if (!principal) return { kind: "refused", reason: `no principal has the code ${update.principal}` };
  const parsed = parseAutomate(update.payload, { timeZone: ctx.timeZone, privatePolicy: ctx.privatePolicy });
  if (parsed.events.length === 0 && parsed.warnings.length > 0) return { kind: "refused", reason: parsed.warnings.join(" ") };
  const diff = diffImport(toStored(ctx.events, principal.id), parsed);
  if (!changesAnything(diff)) return { kind: "unchanged" };
  if (marksMostGone(diff)) {
    const reason = `it would mark ${diff.gone.length} of ${storedInRange(diff)} events gone, so it was held back. If they really are gone, import an .ics file and confirm`;
    return { kind: "refused", reason };
  }
  const result = ctx.run({ now: ctx.now, principal: principal.id, file: SYNC_FILE, diff });
  return result.ok ? { kind: "applied" } : { kind: "refused", reason: result.error };
}
