// overlay.set: the office's layer on top of an imported event.
import { defineCommand, type Tx } from "@trellis/framework";
import { defined, optionalBoolean, optionalText, requireNow, requireText, writeLog } from "./shared";

export type Prep = "none" | "needed" | "in-hand" | "ready";
const PREPS: readonly Prep[] = ["none", "needed", "in-hand", "ready"];

export interface OverlaySetInput {
  now: string;
  /** The event id. */
  event: string;
  prep?: Prep;
  flagged?: boolean;
  /** A user id, or "" for nobody. */
  prepOwner?: string;
  notes?: string;
  outcome?: string;
  /** True archives the event (it moves to the graveyard); false brings it back. */
  archived?: boolean;
  /** With archived true: one of ARCHIVE_REASONS (unknown when left out). */
  archiveReason?: string;
}

export const overlayId = (tx: Tx, eventId: string): string => tx.id("overlay", eventId);

function checkPrep(tx: Tx, prep: unknown): Prep | undefined {
  if (prep === undefined) return undefined;
  if (!PREPS.includes(prep as Prep)) tx.fail("Prep must be none, needed, in hand or ready.");
  return prep as Prep;
}

function logChange(tx: Tx, now: string, event: { id: string; principal?: string }, before: { prep: string; flagged: boolean }, after: { prep: string; flagged: boolean }): void {
  const base = { area: "overlay" as const, principal: event.principal ?? "", event: event.id };
  if (after.prep !== before.prep) {
    const note = after.flagged !== before.flagged ? (after.flagged ? "Also flagged" : "Also unflagged") : "";
    writeLog(tx, now, { ...base, kind: "prep", from: before.prep, to: after.prep, note });
  } else if (after.flagged !== before.flagged) {
    writeLog(tx, now, { ...base, kind: "flag", from: String(before.flagged), to: String(after.flagged) });
  }
}

/** Creates or updates the overlay. Logs once, only when prep or the flag changes. Returns the overlay id. */
/** Why an engagement was archived (OUT-65 Q6). */
export const ARCHIVE_REASONS = [
  { value: "cancelled", label: "Cancelled" }, { value: "declined", label: "Declined" }, { value: "moved", label: "Moved" },
  { value: "replaced", label: "Replaced" }, { value: "unknown", label: "Unknown" },
] as const;

export const overlaySet = defineCommand("overlay.set", (tx: Tx, input: OverlaySetInput) => {
  const now = requireNow(tx, input);
  const eventId = requireText(tx, input.event, "The engagement");
  const event = tx.get("events", eventId);
  if (!event || event._deleted) tx.fail("That engagement hasn't arrived on this computer yet.");
  const fields = defined({
    prep: checkPrep(tx, input.prep),
    flagged: optionalBoolean(tx, input.flagged, "Flagged"),
    prepOwner: optionalText(tx, input.prepOwner, "The prep owner"),
    notes: optionalText(tx, input.notes, "The notes") === undefined ? undefined : input.notes,
    outcome: optionalText(tx, input.outcome, "The outcome") === undefined ? undefined : input.outcome,
    archived: optionalBoolean(tx, input.archived, "Archived") === undefined ? undefined : input.archived ? now : "",
    archiveReason: input.archived === undefined ? undefined : input.archived ? checkReason(tx, input.archiveReason) : "",
  });
  const id = overlayId(tx, eventId);
  const current = tx.get("overlays", id);
  if (current?._deleted) tx.restore("overlays", id);
  const before = { prep: current?.prep ?? "none", flagged: current?.flagged ?? false };
  const after = { prep: fields.prep ?? before.prep, flagged: fields.flagged ?? before.flagged };
  tx.put("overlays", id, current ? fields : { prep: "none", flagged: false, ...fields, event: eventId });
  logChange(tx, now, event, before, after);
  const wasArchived = Boolean(current?.archived);
  if (input.archived !== undefined && input.archived !== wasArchived) {
    const note = input.archived ? `Reason: ${ARCHIVE_REASONS.find((r) => r.value === fields.archiveReason)?.label ?? "Unknown"}` : "";
    writeLog(tx, now, { area: "overlay", kind: input.archived ? "archived" : "unarchived", principal: event.principal ?? "", event: eventId, note });
  }
  return id;
});

function checkReason(tx: Tx, reason: unknown): string {
  if (reason === undefined) return "unknown";
  if (!ARCHIVE_REASONS.some((r) => r.value === reason)) tx.fail("Choose why it is archived: cancelled, declined, moved, replaced or unknown.");
  return reason as string;
}
