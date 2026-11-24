// wizard.apply (OUT-85, v0.3 brief 8.2): the clash wizard's chosen fixes, in
// one run. Moves become proposals (never Outlook changes), quiet and links set
// the overlay, and a note is added to both engagements' notes with the date.
// One log row per fix; "leave" changes nothing.
import { defineCommand, type Tx } from "@trellis/framework";
import type { Fix } from "../clash-wizard";
import { formatDay } from "../dates";
import { OFFICE_ID } from "./office";
import { overlayId, overlaySet } from "./overlay";
import { proposalMove } from "./proposals";
import { requireNow, requireText, writeLog } from "./shared";

export interface WizardApplyInput {
  now: string;
  fixes: readonly Fix[];
}

const KINDS = ["move", "quiet", "link", "note", "leave"];

export const wizardApply = defineCommand("wizard.apply", (tx: Tx, input: WizardApplyInput) => {
  const now = requireNow(tx, input);
  if (!Array.isArray(input.fixes)) tx.fail("The wizard sent no fixes.");
  const fixes = input.fixes.filter((f) => f && f.kind !== "leave");
  for (const fix of fixes) if (!KINDS.includes(fix?.kind)) tx.fail("The wizard sent a fix it doesn't know.");
  // A command reads the tables as they were before it ran, so each engagement's
  // overlay changes are gathered first and set once; the last move of an engagement wins.
  const layer = new Map<string, { quiet?: boolean; parent?: string; notes: string[] }>();
  const at = (event: string) => layer.get(event) ?? layer.set(event, { notes: [] }).get(event)!;
  const moves = new Map<string, { start: string; end: string }>();
  for (const fix of fixes) {
    if (fix.kind === "move") moves.set(requireText(tx, fix.event, "The engagement"), { start: fix.start, end: fix.end });
    else if (fix.kind === "quiet") at(requireText(tx, fix.event, "The engagement")).quiet = true;
    else if (fix.kind === "link") at(requireText(tx, fix.event, "The engagement")).parent = requireText(tx, fix.parent, "The engagement to link under");
    else if (fix.kind === "note") {
      const note = requireText(tx, fix.note, "The note");
      if (!Array.isArray(fix.events) || fix.events.length !== 2) tx.fail("A note goes on both engagements in the clash.");
      for (const id of fix.events) at(requireText(tx, id, "The engagement")).notes.push(note);
      const event = tx.get("events", fix.events[0]);
      writeLog(tx, now, { area: "overlay", kind: "note", principal: event?.principal ?? "", event: fix.events[0], to: fix.events[1], note });
    }
  }
  for (const [event, slot] of moves) proposalMove.handler(tx, { now, event, ...slot });
  const zone = tx.get("office", OFFICE_ID)?.timezone || "UTC";
  for (const [event, change] of layer) {
    const current = tx.get("overlays", overlayId(tx, event));
    const dated = change.notes.map((n) => `${formatDay(now, zone)}: ${n}`);
    const notes = dated.length ? [current?._deleted ? "" : (current?.notes ?? ""), ...dated].filter(Boolean).join("\n") : undefined;
    overlaySet.handler(tx, { now, event, quiet: change.quiet, parent: change.parent, notes });
  }
  return fixes.length;
});
