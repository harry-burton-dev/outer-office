// people.ackPrivacy: the privacy notice, read once per user.
import { defineCommand, type Tx } from "@trellis/framework";
import { requireNow } from "./shared";

export interface AckPrivacyInput {
  now: string;
}

/** Records the caller's acknowledgement once; later runs write nothing and return the first time. */
export const ackPrivacy = defineCommand("people.ackPrivacy", (tx: Tx, input: AckPrivacyInput) => {
  const now = requireNow(tx, input);
  const id = tx.id("person", tx.user);
  const current = tx.get("people", id);
  if (current?.privacyAckAt) return current.privacyAckAt;
  if (current?._deleted) tx.restore("people", id);
  tx.put("people", id, { userId: tx.user, privacyAckAt: now });
  return now;
});
