// automate.recordRun: what the app did with the newest file a Power Automate
// flow left for a principal (OUT-91), kept for the Automate page. One record
// per flow and principal code, overwritten by each newer file. Logs nothing:
// the import and its log entry already say what changed.
import { defineCommand, type Tx } from "@trellis/framework";
import { isIsoInstant, requireNow, requireText } from "./shared";

export type FlowOutcome = "applied" | "unchanged" | "refused";
const OUTCOMES: ReadonlySet<string> = new Set<FlowOutcome>(["applied", "unchanged", "refused"]);

export interface FlowRunInput {
  now: string;
  /** The flow's id, such as "diary-sync". */
  flow: string;
  /** The principal's code, which is also the folder's name. */
  principal: string;
  /** The file's name. */
  file: string;
  /** When the flow made it (ISO UTC, from the name), or "" when the name isn't a time. */
  fileAt: string;
  outcome: FlowOutcome;
  /** Why a refused file was not used. */
  reason?: string;
  added?: number;
  changed?: number;
  gone?: number;
  /** How many events the file held. */
  events?: number;
}

export const flowRunId = (tx: Tx, flow: string, principal: string): string => tx.id("flowRun", flow, principal);

const count = (value: unknown): number => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0);

export const automateRecordRun = defineCommand("automate.recordRun", (tx: Tx, input: FlowRunInput) => {
  const now = requireNow(tx, input);
  const flow = requireText(tx, input.flow, "The flow");
  const principal = requireText(tx, input.principal, "The principal's code");
  const file = requireText(tx, input.file, "The file's name");
  if (input.fileAt !== "" && !isIsoInstant(input.fileAt)) tx.fail("The file's time is not an ISO date and time in UTC.");
  if (!OUTCOMES.has(input.outcome)) tx.fail("That is not a run's outcome.");
  const id = flowRunId(tx, flow, principal);
  const current = tx.get("flowRuns", id);
  if (current && !current._deleted) {
    // The same file again (another computer, or a reload) changes nothing; an older one never replaces a newer one.
    if (current.file === file && current.outcome === input.outcome) return;
    if (input.fileAt !== "" && (current.fileAt ?? "") > input.fileAt) return;
  }
  if (current?._deleted) tx.restore("flowRuns", id);
  tx.put("flowRuns", id, {
    flow, principal, file, fileAt: input.fileAt, readAt: now, readBy: tx.user,
    outcome: input.outcome, reason: input.outcome === "refused" ? (input.reason ?? "") : "",
    added: count(input.added), changed: count(input.changed), gone: count(input.gone), events: count(input.events),
  });
});
