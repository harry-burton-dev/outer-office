// ruleSetting.set: a user switches or tunes a built-in rule for themselves.
// update.set: a user's state for one update (v0.3 brief 5.3, OUT-86). A
// needs-you update can only be snoozed: it leaves when its cause is fixed.
// Both write only the caller's own records and log nothing.
import { defineCommand, type Tx } from "@trellis/framework";
import { ruleById, ruleOfKey, SURFACES, type Surface } from "../rules";
import { isIsoInstant, requireNow, requireText } from "./shared";

export interface RuleSettingSetInput {
  now: string;
  rule: string;
  on?: boolean;
  /** In the rule's unit; only for a rule with an amount. */
  amount?: number;
  surfaces?: readonly Surface[];
}

export const ruleSettingSet = defineCommand("ruleSetting.set", (tx: Tx, input: RuleSettingSetInput) => {
  requireNow(tx, input);
  const rule = ruleById(requireText(tx, input.rule, "The rule"));
  if (!rule) tx.fail("That is not a rule.");
  if (input.on !== undefined && typeof input.on !== "boolean") tx.fail("On must be true or false.");
  if (input.amount !== undefined) {
    if (!rule.amount) tx.fail("That rule has no amount.");
    const { min, max, unit } = rule.amount;
    if (!Number.isInteger(input.amount) || input.amount < min || input.amount > max) tx.fail(`The amount must be a whole number of ${unit} from ${min} to ${max}.`);
  }
  if (input.surfaces !== undefined && (!Array.isArray(input.surfaces) || input.surfaces.some((s) => !SURFACES.includes(s)))) {
    tx.fail("Surfaces are home, needs and badge.");
  }
  const id = tx.id("ruleSetting", tx.user, rule.id);
  const current = tx.get("ruleSettings", id);
  if (current?._deleted) tx.restore("ruleSettings", id);
  tx.put("ruleSettings", id, {
    userId: tx.user, rule: rule.id,
    ...(input.on !== undefined && { on: input.on }),
    ...(input.amount !== undefined && { amount: input.amount }),
    ...(input.surfaces !== undefined && { surfaces: SURFACES.filter((s) => input.surfaces?.includes(s)).join(",") }),
  });
});

export type UpdateAction = "seen" | "dismissed" | "snoozed" | "pinned" | "clear";

export interface UpdateSetInput {
  now: string;
  /** The update's coalesce key. */
  key: string;
  state: UpdateAction;
  /** The newest change the update held when the user acted. Default now. */
  at?: string;
  /** With snoozed: until when. */
  until?: string;
}

const STATES: readonly UpdateAction[] = ["seen", "dismissed", "snoozed", "pinned", "clear"];

export const updateSet = defineCommand("update.set", (tx: Tx, input: UpdateSetInput) => {
  const now = requireNow(tx, input);
  const key = requireText(tx, input.key, "The update");
  if (!STATES.includes(input.state)) tx.fail("An update can be seen, dismissed, snoozed, pinned or cleared.");
  if (ruleOfKey(key)?.lane === "needs" && input.state !== "snoozed" && input.state !== "clear") {
    tx.fail("A needs-you update can only be snoozed. It goes when its cause is fixed.");
  }
  if (input.at !== undefined && !isIsoInstant(input.at)) tx.fail("The time is not an ISO date and time in UTC.");
  if (input.state === "snoozed" && (!isIsoInstant(input.until) || input.until <= now)) tx.fail("Snooze until a time after now.");
  const id = tx.id("update", tx.user, key);
  const current = tx.get("updateState", id);
  if (current?._deleted) tx.restore("updateState", id);
  tx.put("updateState", id, {
    userId: tx.user, key, state: input.state === "clear" ? "" : input.state,
    until: input.state === "snoozed" ? (input.until ?? "") : "", at: input.at ?? now,
  });
});
