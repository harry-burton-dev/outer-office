// home.markSeen: the user has seen Home for a principal (or their own tasks)
// up to a time (OUT-58): "Mark all seen". It writes only the caller's own
// record and logs nothing. Rules are switched with ruleSetting.set (OUT-86).
import { defineCommand, type Tx } from "@trellis/framework";
import { ME, seenId } from "../home";
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
