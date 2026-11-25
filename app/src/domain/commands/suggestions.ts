// Viewers suggest (OUT-85, D15): a viewer's drag, Find a time choice or clash
// wizard fix makes a suggestion, never a proposal. An assistant takes it, which
// makes exactly the proposal, quiet flag, link or note it describes, or
// dismisses it. Either way leaves one log row.
import { defineCommand, type Tx } from "@trellis/framework";
import type { Fix } from "../clash-wizard";
import { formatDay } from "../dates";
import { OFFICE_ID } from "./office";
import { overlayId, overlaySet } from "./overlay";
import { proposalMove, proposalMoveGroup } from "./proposals";
import { isIsoInstant, requireNow, requireText, writeLog } from "./shared";

export type SuggestionKind = "move" | "quiet" | "link" | "note";
const KINDS: readonly SuggestionKind[] = ["move", "quiet", "link", "note"];

export interface SuggestionMakeInput {
  now: string;
  event: string;
  kind: SuggestionKind;
  /** For a move: the new ISO UTC instants. */
  start?: string;
  end?: string;
  /** For a link: the engagement to link under. */
  parent?: string;
  /** For a note: what to add to the engagement's notes. */
  note?: string;
}

/** Writes a suggestion and changes nothing else. Returns its id. */
export const suggestionMake = defineCommand("suggestion.make", (tx: Tx, input: SuggestionMakeInput) => {
  const now = requireNow(tx, input);
  const eventId = requireText(tx, input.event, "The engagement");
  const event = tx.get("events", eventId);
  if (!event || event._deleted || event.gone) tx.fail("That engagement hasn't arrived on this computer yet.");
  if (!KINDS.includes(input.kind)) tx.fail("A suggestion is a move, quiet, a link or a note.");
  const fields = { event: eventId, principal: event.principal ?? "", by: tx.user, at: now, kind: input.kind, start: "", end: "", parent: "", note: "", state: "open", doneBy: "" };
  if (input.kind === "move") {
    if (!isIsoInstant(input.start) || !isIsoInstant(input.end)) tx.fail("Choose a new date and time.");
    if (input.end <= input.start) tx.fail("The meeting must end after it starts.");
    Object.assign(fields, { start: input.start, end: input.end });
  } else if (input.kind === "link") fields.parent = requireText(tx, input.parent, "The engagement to link under");
  else if (input.kind === "note") fields.note = requireText(tx, input.note, "The note");
  const id = tx.newId();
  tx.put("suggestions", id, fields);
  return id;
});

function openSuggestion(tx: Tx, id: string) {
  const suggestion = tx.get("suggestions", requireText(tx, id, "The suggestion"));
  if (!suggestion || suggestion._deleted) tx.fail("That suggestion hasn't arrived on this computer yet.");
  if (suggestion.state !== "open") tx.fail(`That suggestion was already ${suggestion.state === "taken" ? "taken" : "dismissed"}.`);
  return suggestion;
}

/** Turns a suggestion into what it describes, with that change's own log row. */
export const suggestionTake = defineCommand("suggestion.take", (tx: Tx, input: { now: string; id: string }) => {
  const now = requireNow(tx, input);
  const s = openSuggestion(tx, input.id);
  const event = s.event ?? "";
  if (s.kind === "move") {
    const grouped = tx.list("overlays").some((o) => !o._deleted && o.parent === event);
    (grouped ? proposalMoveGroup : proposalMove).handler(tx, { now, event, start: s.start ?? "", end: s.end ?? "" });
  } else if (s.kind === "quiet") overlaySet.handler(tx, { now, event, quiet: true });
  else if (s.kind === "link") overlaySet.handler(tx, { now, event, parent: s.parent ?? "" });
  else {
    const zone = tx.get("office", OFFICE_ID)?.timezone || "UTC";
    const current = tx.get("overlays", overlayId(tx, event));
    const notes = [current?._deleted ? "" : (current?.notes ?? ""), `${formatDay(now, zone)}: ${s.note ?? ""}`].filter(Boolean).join("\n");
    overlaySet.handler(tx, { now, event, notes });
    writeLog(tx, now, { area: "overlay", kind: "note", principal: s.principal ?? "", event, note: s.note ?? "" });
  }
  tx.put("suggestions", s.id, { state: "taken", doneBy: tx.user });
});

/** Dismisses a suggestion: nothing else changes. */
export const suggestionDismiss = defineCommand("suggestion.dismiss", (tx: Tx, input: { now: string; id: string }) => {
  const now = requireNow(tx, input);
  const s = openSuggestion(tx, input.id);
  tx.put("suggestions", s.id, { state: "dismissed", doneBy: tx.user });
  writeLog(tx, now, { area: "proposal", kind: "suggestion-dismissed", principal: s.principal ?? "", event: s.event ?? "", note: s.kind ?? "" });
});

/** A viewer's clash wizard run: one suggestion per fix, a note as one on each engagement. Returns how many. */
export const suggestionFromWizard = defineCommand("suggestion.fromWizard", (tx: Tx, input: { now: string; fixes: readonly Fix[] }) => {
  const now = requireNow(tx, input);
  if (!Array.isArray(input.fixes)) tx.fail("The wizard sent no fixes.");
  let made = 0;
  for (const fix of input.fixes) {
    if (!fix || fix.kind === "leave") continue;
    if (fix.kind === "note") {
      if (!Array.isArray(fix.events) || fix.events.length !== 2) tx.fail("A note goes on both engagements in the clash.");
      for (const event of fix.events) suggestionMake.handler(tx, { now, event, kind: "note", note: fix.note });
      made += 2;
    } else {
      suggestionMake.handler(tx, { now, ...fix });
      made += 1;
    }
  }
  return made;
});
