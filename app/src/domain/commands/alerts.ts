// The alert commands of the v0.3 brief (OUT-86), none of which log:
// - ruleSetting.set: a user switches or tunes a built-in rule for themselves.
// - update.set: a user's state for one update. A needs-you update can only be
//   snoozed: it leaves when its cause is fixed.
// - rule.save, rule.remove: a user's own rules, for themselves only (D4).
// - cover.save, cover.remove: who covers whom, for which principal, when.
import { defineCommand, type Tx } from "@trellis/framework";
import { ruleById, ruleOfKey, SURFACES, type Lane, type Surface } from "../rules";
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

export interface RuleSaveInput {
  now: string;
  /** Leave out to make a rule. */
  id?: string;
  name: string;
  /** A built-in rule id: the condition from the menu. */
  condition: string;
  /** A principal id, or "all". */
  principal: string;
  /** For a condition with an amount, in its unit. */
  amount?: number;
  lane: Lane;
  surfaces: readonly Surface[];
  on: boolean;
}

/** Makes or edits one of the caller's own rules (D4). Returns its id. */
export const ruleSave = defineCommand("rule.save", (tx: Tx, input: RuleSaveInput) => {
  requireNow(tx, input);
  const name = requireText(tx, input.name, "The rule's name");
  const base = ruleById(requireText(tx, input.condition, "The condition"));
  if (!base) tx.fail("Choose a condition from the menu.");
  const principal = requireText(tx, input.principal, "The principal");
  if (principal !== "all") {
    const found = tx.get("principals", principal);
    if (!found || found._deleted) tx.fail("That principal no longer exists.");
  }
  if (input.amount !== undefined) {
    if (!base.amount) tx.fail("That condition has no amount.");
    const { min, max, unit } = base.amount;
    if (!Number.isInteger(input.amount) || input.amount < min || input.amount > max) tx.fail(`The amount must be a whole number of ${unit} from ${min} to ${max}.`);
  }
  if (input.lane !== "needs" && input.lane !== "info") tx.fail("The lane is needs or info.");
  if (base.kind === "state" && input.lane !== "needs") tx.fail("That condition is a standing cause, so it goes in the needs-you lane.");
  if (!Array.isArray(input.surfaces) || input.surfaces.some((x) => !SURFACES.includes(x))) tx.fail("Surfaces are home, needs and badge.");
  if (typeof input.on !== "boolean") tx.fail("On must be true or false.");
  if (input.id !== undefined) {
    const current = tx.get("rules", input.id);
    if (!current || current._deleted || current.owner !== tx.user) tx.fail("That rule has been removed, or isn't yours.");
  }
  const id = input.id ?? tx.newId();
  const params = JSON.stringify({ principal, ...(input.amount !== undefined && { amount: input.amount }) });
  tx.put("rules", id, {
    owner: tx.user, name, condition: base.id, params, lane: input.lane, on: input.on,
    surfaces: SURFACES.filter((x) => input.surfaces.includes(x)).join(","),
  });
  return id;
});

export interface RuleRemoveInput {
  now: string;
  id: string;
}

export const ruleRemove = defineCommand("rule.remove", (tx: Tx, input: RuleRemoveInput) => {
  requireNow(tx, input);
  const current = tx.get("rules", requireText(tx, input.id, "The rule"));
  if (!current || current._deleted) return;
  if (current.owner !== tx.user) tx.fail("Only the person who made a rule can remove it.");
  tx.remove("rules", input.id);
});

export interface CoverSaveInput {
  now: string;
  id?: string;
  principal: string;
  /** The user away. */
  absent: string;
  /** The user covering. */
  cover: string;
  start: string;
  end: string;
}

/** Sets cover, or changes it. Returns its id. */
export const coverSave = defineCommand("cover.save", (tx: Tx, input: CoverSaveInput) => {
  requireNow(tx, input);
  const principal = requireText(tx, input.principal, "The principal");
  const found = tx.get("principals", principal);
  if (!found || found._deleted) tx.fail("That principal no longer exists.");
  const absent = requireText(tx, input.absent, "Who is away");
  const cover = requireText(tx, input.cover, "Who is covering");
  if (absent === cover) tx.fail("Someone can't cover for themselves.");
  if (!isIsoInstant(input.start) || !isIsoInstant(input.end)) tx.fail("The start and end are not ISO dates and times in UTC.");
  if (input.end <= input.start) tx.fail("Cover must end after it starts.");
  if (input.id !== undefined) {
    const current = tx.get("cover", input.id);
    if (!current || current._deleted) tx.fail("That cover has been removed.");
  }
  const id = input.id ?? tx.newId();
  tx.put("cover", id, { principal, absent, cover, start: input.start, end: input.end });
  return id;
});

export const coverRemove = defineCommand("cover.remove", (tx: Tx, input: { now: string; id: string }) => {
  requireNow(tx, input);
  const current = tx.get("cover", requireText(tx, input.id, "The cover"));
  if (!current || current._deleted) return;
  tx.remove("cover", input.id);
});
