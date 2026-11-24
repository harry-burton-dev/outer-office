// overlay.set: the office's layer on top of an imported event.
import { defineCommand, type Tx } from "@trellis/framework";
import { isInside } from "../clashes";
import { dateIn } from "../dates";
import type { Event } from "../selectors";
import { OFFICE_ID } from "./office";
import { defined, optionalBoolean, optionalNumber, optionalText, requireNow, requireText, writeLog } from "./shared";

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
  /** A quiet engagement never clashes (OUT-84). */
  quiet?: boolean;
  /** 1 to 4, the task scale: 1 is the highest, 4 is none set (D14). */
  priority?: number;
  /** The engagement to link this one under, or "" to unlink (5.2). */
  parent?: string;
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
    quiet: optionalBoolean(tx, input.quiet, "Quiet"),
    priority: checkPriority(tx, input.priority),
    parent: checkParent(tx, event, input.parent),
  });
  const id = overlayId(tx, eventId);
  const current = tx.get("overlays", id);
  if (current?._deleted) tx.restore("overlays", id);
  const before = { prep: current?.prep ?? "none", flagged: current?.flagged ?? false };
  const after = { prep: fields.prep ?? before.prep, flagged: fields.flagged ?? before.flagged };
  tx.put("overlays", id, current ? fields : { prep: "none", flagged: false, quiet: false, parent: "", priority: 4, ...fields, event: eventId });
  logChange(tx, now, event, before, after);
  logLayer(tx, now, event, current, fields);
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

function checkPriority(tx: Tx, priority: unknown): number | undefined {
  const value = optionalNumber(tx, priority, "The priority");
  if (value !== undefined && ![1, 2, 3, 4].includes(value)) tx.fail("Priority must be 1, 2, 3 or 4.");
  return value;
}

/** A link goes one level deep, within one principal's day, and the child must sit wholly inside its parent when linked (5.2, D13). */
function checkParent(tx: Tx, child: Event, value: unknown): string | undefined {
  const parentId = optionalText(tx, value, "The engagement to link under");
  if (parentId === undefined || parentId === "") return parentId;
  if (parentId === child.id) tx.fail("An engagement can't be linked under itself.");
  const parent = tx.get("events", parentId);
  if (!parent || parent._deleted) tx.fail("The engagement to link under hasn't arrived on this computer yet.");
  if (parent.gone === true) tx.fail("The engagement to link under is gone from Outlook.");
  if (parent.principal !== child.principal) tx.fail("Only engagements in the same diary can be linked.");
  if (parent.allDay === true || child.allDay === true) tx.fail("All-day engagements can't be linked.");
  const zone = tx.get("office", OFFICE_ID)?.timezone || "UTC";
  if (dateIn(parent.start ?? "", zone) !== dateIn(child.start ?? "", zone)) tx.fail("Only engagements on the same day can be linked.");
  if (tx.get("overlays", overlayId(tx, parentId))?.parent) tx.fail("That engagement is linked under another, and links go one level deep.");
  if (tx.list("overlays").some((o) => !o._deleted && o.parent === child.id)) tx.fail("This engagement has engagements linked under it, and links go one level deep.");
  if (!isInside(child, parent)) tx.fail("An engagement can be linked only under one it sits wholly inside.");
  return parentId;
}

/** One log row for each change to quiet, priority or the link. */
function logLayer(tx: Tx, now: string, event: { id: string; principal?: string }, current: { quiet?: boolean; priority?: number; parent?: string } | undefined, fields: { quiet?: boolean; priority?: number; parent?: string }): void {
  const base = { area: "overlay" as const, principal: event.principal ?? "", event: event.id };
  const quiet = current?.quiet ?? false;
  if (fields.quiet !== undefined && fields.quiet !== quiet) writeLog(tx, now, { ...base, kind: "quiet", from: String(quiet), to: String(fields.quiet) });
  const priority = current?.priority ?? 4;
  if (fields.priority !== undefined && fields.priority !== priority) writeLog(tx, now, { ...base, kind: "priority", from: String(priority), to: String(fields.priority) });
  const parent = current?.parent ?? "";
  if (fields.parent !== undefined && fields.parent !== parent) {
    writeLog(tx, now, fields.parent ? { ...base, kind: "linked", from: parent, to: fields.parent } : { ...base, kind: "unlinked", from: parent });
  }
}
