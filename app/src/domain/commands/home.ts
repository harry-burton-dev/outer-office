// home.markSeen: the user has seen Home for a principal (or their own tasks)
// up to a time. home.setWatch: which watch rules the user has on (OUT-58).
// Both write only the caller's own records and log nothing.
import { defineCommand, type Tx } from "@trellis/framework";
import { isRuleId, ME, seenId, watchOffFor } from "../home";
import { isIsoInstant, requireNow, requireText } from "./shared";

export interface HomeMarkSeenInput {
  now: string;
  /** A principal id, or "me". */
  scope: string;
  /** The newest change the user was shown; seen up to then. Default now. */
  upTo?: string;
}

export const homeMarkSeen = defineCommand("home.markSeen", (tx: Tx, input: HomeMarkSeenInput) => {
  const now = requireNow(tx, input);
  const scope = requireText(tx, input.scope, "The principal");
  if (scope !== ME) {
    const principal = tx.get("principals", scope);
    if (!principal || principal._deleted) tx.fail("That principal no longer exists.");
  }
  if (input.upTo !== undefined && !isIsoInstant(input.upTo)) tx.fail("The time seen up to is not an ISO date and time in UTC.");
  const at = input.upTo ?? now;
  const id = tx.id(...seenId(tx.user, scope));
  const current = tx.get("seen", id);
  if (current && !current._deleted && (current.at ?? "") >= at) return current.at;
  if (current?._deleted) tx.restore("seen", id);
  tx.put("seen", id, { userId: tx.user, scope, at });
  return at;
});

export interface HomeSetWatchInput {
  now: string;
  /** Every rule id the user wants on. */
  on: readonly string[];
}

export const homeSetWatch = defineCommand("home.setWatch", (tx: Tx, input: HomeSetWatchInput) => {
  requireNow(tx, input);
  if (!Array.isArray(input.on) || input.on.some((id) => typeof id !== "string" || !isRuleId(id))) tx.fail("That is not a watch rule.");
  const watchOff = watchOffFor(new Set(input.on));
  const id = tx.id("person", tx.user);
  const current = tx.get("people", id);
  if (current && !current._deleted && current.watchOff === watchOff) return;
  if (current?._deleted) tx.restore("people", id);
  tx.put("people", id, { userId: tx.user, watchOff });
});
