// Proposals (OUT-77): moving an event proposes the change instead of making it.
// The event stays where Outlook has it; the proposal holds the new time.
import { defineCommand, type Tx } from "@trellis/framework";
import { isIsoInstant, requireNow, requireText, writeLog } from "./shared";

export interface ProposalMoveInput {
  now: string;
  /** The event id. */
  event: string;
  /** ISO UTC instants: the new start and end. */
  start: string;
  end: string;
}

export interface ProposalWithdrawInput {
  now: string;
  event: string;
}

export const proposalId = (tx: Tx, eventId: string): string => tx.id("proposal", eventId);

function liveEvent(tx: Tx, id: string) {
  const event = tx.get("events", id);
  if (!event || event._deleted || event.gone) tx.fail("That engagement hasn't arrived on this computer yet.");
  return event;
}

/** Proposes a new time for an event, replacing any earlier proposal for it. */
export const proposalMove = defineCommand("proposal.move", (tx: Tx, input: ProposalMoveInput) => {
  const now = requireNow(tx, input);
  const id = requireText(tx, input.event, "The engagement");
  if (!isIsoInstant(input.start) || !isIsoInstant(input.end)) tx.fail("Choose a new date and time.");
  if (input.end <= input.start) tx.fail("The meeting must end after it starts.");
  const event = liveEvent(tx, id);
  if (input.start === event.start && input.end === event.end) tx.fail("That is where the meeting already is.");
  const pid = proposalId(tx, id);
  if (tx.get("proposals", pid)?._deleted) tx.restore("proposals", pid);
  tx.put("proposals", pid, { event: id, principal: event.principal ?? "", start: input.start, end: input.end, by: tx.user, at: now });
  writeLog(tx, now, { area: "proposal", kind: "move", principal: event.principal ?? "", event: id, from: event.start ?? "", to: input.start });
});

/** Withdraws the proposal for an event. */
export const proposalWithdraw = defineCommand("proposal.withdraw", (tx: Tx, input: ProposalWithdrawInput) => {
  const now = requireNow(tx, input);
  const id = requireText(tx, input.event, "The engagement");
  const pid = proposalId(tx, id);
  const current = tx.get("proposals", pid);
  if (!current || current._deleted) tx.fail("There is no proposal for that meeting.");
  tx.remove("proposals", pid);
  writeLog(tx, now, { area: "proposal", kind: "withdraw", principal: current.principal ?? "", event: id, from: current.start ?? "" });
});
