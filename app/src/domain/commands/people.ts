// people.ackPrivacy: the privacy notice, read once per user. people.setMode:
// assistant or viewer, set from the admin page.
import { defineCommand, type Tx } from "@trellis/framework";
import { requireNow, requireText, writeLog } from "./shared";

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

export type PersonMode = "assistant" | "viewer";
const MODES: readonly PersonMode[] = ["assistant", "viewer"];

export interface SetModeInput {
  now: string;
  userId: string;
  mode: PersonMode;
}

/** Sets a user's mode (a missing record counts as assistant); one setup log row when it changes. */
export const setMode = defineCommand("people.setMode", (tx: Tx, input: SetModeInput) => {
  const now = requireNow(tx, input);
  const userId = requireText(tx, input.userId, "The user");
  const mode = MODES.find((m) => m === input.mode);
  if (!mode) tx.fail("The mode must be assistant or viewer.");
  const id = tx.id("person", userId);
  const current = tx.get("people", id);
  const live = current && !current._deleted ? current : undefined;
  const before: PersonMode = live?.mode === "viewer" ? "viewer" : "assistant";
  if (before === mode) return;
  if (current?._deleted) tx.restore("people", id);
  tx.put("people", id, { userId, mode });
  writeLog(tx, now, { area: "setup", kind: "mode-changed", from: before, to: mode, note: userId });
});
