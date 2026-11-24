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

/** What Outlook needs to create a meeting. Times are ISO UTC instants; an all-day meeting runs midnight to midnight. */
export interface NewMeeting {
  subject: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  /** A Teams meeting link is added in Outlook. */
  online?: boolean;
  /** One per line, "Name <address>". */
  requiredAttendees?: string;
  optionalAttendees?: string;
  /** Comma-separated Outlook categories. */
  categories?: string;
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere";
  importance?: "low" | "normal" | "high";
  sensitivity?: "normal" | "private";
  notes?: string;
}

export interface ProposalNewInput extends NewMeeting {
  now: string;
  principal: string;
  /** To change a proposal already made. */
  id?: string;
}

const SHOW_AS = ["free", "tentative", "busy", "oof", "workingElsewhere"];
const IMPORTANCE = ["low", "normal", "high"];
const SENSITIVITY = ["normal", "private"];

function oneOf(tx: Tx, value: unknown, allowed: readonly string[], fallback: string, label: string): string {
  if (value === undefined || value === "") return fallback;
  if (typeof value !== "string" || !allowed.includes(value)) tx.fail(`${label} must be one of ${allowed.join(", ")}.`);
  return value;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Proposes a new meeting for a principal. It stays a proposal until an import finds it in Outlook. */
export const proposalNew = defineCommand("proposal.new", (tx: Tx, input: ProposalNewInput) => {
  const now = requireNow(tx, input);
  const principal = requireText(tx, input.principal, "The principal");
  const p = tx.get("principals", principal);
  if (!p || p._deleted) tx.fail("That principal hasn't arrived on this computer yet.");
  const subject = requireText(tx, input.subject, "The subject");
  if (!isIsoInstant(input.start) || !isIsoInstant(input.end)) tx.fail("Choose a date and time.");
  if (input.end <= input.start) tx.fail("The meeting must end after it starts.");
  const fields = {
    kind: "new", event: "", principal, start: input.start, end: input.end, by: tx.user, at: now, subject,
    allDay: input.allDay === true, location: text(input.location), online: input.online === true,
    requiredAttendees: text(input.requiredAttendees), optionalAttendees: text(input.optionalAttendees), categories: text(input.categories),
    showAs: oneOf(tx, input.showAs, SHOW_AS, "busy", "Show as"), importance: oneOf(tx, input.importance, IMPORTANCE, "normal", "Importance"),
    sensitivity: oneOf(tx, input.sensitivity, SENSITIVITY, "normal", "Sensitivity"), notes: typeof input.notes === "string" ? input.notes : "",
  };
  let id = input.id;
  if (id !== undefined) {
    const current = tx.get("proposals", id);
    if (!current || current._deleted || current.kind !== "new") tx.fail("That proposal has gone.");
  } else id = tx.newId();
  tx.put("proposals", id, fields);
  if (input.id === undefined) writeLog(tx, now, { area: "proposal", kind: "new", principal, to: input.start, note: subject });
  return id;
});

/** Withdraws a proposed new meeting. */
export const proposalDrop = defineCommand("proposal.drop", (tx: Tx, input: { now: string; id: string }) => {
  const now = requireNow(tx, input);
  const id = requireText(tx, input.id, "The proposal");
  const current = tx.get("proposals", id);
  if (!current || current._deleted) tx.fail("That proposal has gone.");
  tx.remove("proposals", id);
  writeLog(tx, now, { area: "proposal", kind: "withdraw", principal: current.principal ?? "", from: current.start ?? "", note: current.subject ?? "" });
});

const same = (a: string | undefined, b: string | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** An event as an import leaves it, for settling proposals. */
export interface Landed {
  id: string;
  start?: string;
  end?: string;
  subject?: string;
}

/**
 * After an import: a proposal is done once Outlook shows it. A move is done when its event
 * sits at the proposed time; a new meeting when the principal has an event with its subject
 * and start. Both are removed and logged as found. A command reads the tables as they were
 * before it ran, so the import passes in what it just wrote (`landed`) and what went (`goneIds`).
 */
export function settleProposals(tx: Tx, now: string, principal: string, landed: readonly Landed[], goneIds: ReadonlySet<string>): number {
  const byId = new Map<string, Landed>(tx.list("events").filter((e) => e.principal === principal && !e.gone).map((e) => [e.id, e]));
  for (const e of landed) byId.set(e.id, e);
  for (const id of goneIds) byId.delete(id);
  const events = [...byId.values()];
  let settled = 0;
  for (const p of tx.list("proposals")) {
    if (p.principal !== principal) continue;
    const found = p.kind === "new"
      ? events.find((e) => e.start === p.start && same(e.subject, p.subject))
      : events.find((e) => e.id === p.event && e.start === p.start && e.end === p.end);
    if (!found) continue;
    tx.remove("proposals", p.id);
    writeLog(tx, now, { area: "proposal", kind: "settled", principal, event: found.id, to: p.start ?? "" });
    settled += 1;
  }
  return settled;
}
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
  tx.put("proposals", pid, { kind: "move", event: id, principal: event.principal ?? "", start: input.start, end: input.end, by: tx.user, at: now });
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
