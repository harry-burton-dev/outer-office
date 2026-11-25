// The built-in rule library (v0.3 brief 5.3, OUT-86). A rule is "when this is
// true, post an update here". Change rules match log rows; state rules read
// the current diary and post while their cause stands. Each user switches and
// tunes the rules for themselves in ruleSettings; a user with none yet keeps
// what people.watchOff (OUT-58) said. Pure: no hooks.
import type { RowOf } from "@trellis/framework";
import { formatTime } from "./dates";

type LogRow = RowOf<"log">;
type TaskRow = RowOf<"tasks">;
type EventRow = RowOf<"events">;
type RuleSettingRow = RowOf<"ruleSettings">;

export type Lane = "needs" | "info";
export type Surface = "home" | "needs" | "badge";
export const SURFACES: readonly Surface[] = ["home", "needs", "badge"];

export type RuleGroup = "Diary" | "Proposals" | "Tasks" | "Sync";

export interface Amount {
  readonly label: string;
  readonly unit: "hours" | "weeks";
  readonly default: number;
  readonly min: number;
  readonly max: number;
}

export interface ChangeContext {
  user: string;
  task(id: string): TaskRow | undefined;
  event(id: string): EventRow | undefined;
  /** The office's IANA zone and working day ("HH:MM"). */
  timezone: string;
  dayStart: string;
  dayEnd: string;
}

interface RuleBase {
  readonly id: string;
  readonly group: RuleGroup;
  readonly label: string;
  readonly lane: Lane;
  /** Updates for the user's own tasks go to "For you"; the rest to the row's principal. */
  readonly scope: "principal" | "me";
  readonly offByDefault?: boolean;
  readonly amount?: Amount;
}

export interface ChangeRule extends RuleBase {
  readonly kind: "change";
  /** amount is the user's setting, in the rule's unit. */
  match(row: LogRow, context: ChangeContext, amount: number): boolean;
}

export interface StateRule extends RuleBase {
  readonly kind: "state";
}

export type Rule = ChangeRule | StateRule;

const HOUR_MS = 3_600_000;
const is = (area: string, ...kinds: string[]) => (row: LogRow) => row.area === area && kinds.includes(row.kind ?? "");
const calendar = (...kinds: string[]) => is("calendar", ...kinds);

/** Where an added or moved engagement now starts. */
const newStart = (row: LogRow, context: ChangeContext): string =>
  row.kind === "moved" ? (row.to ?? "") : (context.event(row.event ?? "")?.start ?? "");

const change = (rule: Omit<ChangeRule, "kind">): ChangeRule => ({ ...rule, kind: "change" });
const state = (rule: Omit<StateRule, "kind">): StateRule => ({ ...rule, kind: "state" });

export const RULES: readonly Rule[] = [
  change({ id: "added", group: "Diary", label: "A meeting is added", lane: "info", scope: "principal", match: calendar("added") }),
  change({ id: "moved", group: "Diary", label: "A meeting moves", lane: "info", scope: "principal", match: calendar("moved") }),
  change({ id: "changed", group: "Diary", label: "A meeting's details change", lane: "info", scope: "principal", match: calendar("changed") }),
  change({ id: "gone", group: "Diary", label: "A meeting is gone from Outlook", lane: "info", scope: "principal", offByDefault: true, match: calendar("gone") }),
  change({ id: "returned", group: "Diary", label: "A gone meeting comes back", lane: "info", scope: "principal", match: calendar("returned") }),
  change({
    id: "short-notice", group: "Diary", label: "A meeting is added or moved at short notice", lane: "info", scope: "principal",
    amount: { label: "Within", unit: "hours", default: 72, min: 1, max: 336 },
    match: (row, context, amount) => {
      if (!calendar("added", "moved")(row)) return false;
      const start = Date.parse(newStart(row, context));
      const at = Date.parse(row.at ?? "");
      return start >= at && start - at <= amount * HOUR_MS;
    },
  }),
  change({
    id: "out-of-hours", group: "Diary", label: "A meeting is added or moved outside the working day", lane: "info", scope: "principal", offByDefault: true,
    match: (row, context) => {
      if (!calendar("added", "moved")(row)) return false;
      const start = newStart(row, context);
      if (!start || context.event(row.event ?? "")?.allDay) return false;
      const time = formatTime(start, context.timezone);
      return time < context.dayStart || time >= context.dayEnd;
    },
  }),
  change({ id: "flagged-changed", group: "Diary", label: "A meeting is flagged or unflagged", lane: "info", scope: "principal", match: is("overlay", "flag") }),
  change({ id: "proposal-made", group: "Proposals", label: "A move or new meeting is proposed", lane: "info", scope: "principal", match: is("proposal", "move", "new") }),
  change({ id: "proposal-withdrawn", group: "Proposals", label: "A proposal is withdrawn", lane: "info", scope: "principal", match: is("proposal", "withdraw") }),
  change({ id: "proposal-settled", group: "Proposals", label: "A proposal shows up in Outlook", lane: "info", scope: "principal", match: is("proposal", "settled") }),
  // Leaves when the user answers the offer, or it is taken back.
  state({ id: "task-offered", group: "Tasks", label: "A task is offered to you", lane: "needs", scope: "me" }),
  change({
    id: "task-answered", group: "Tasks", label: "Someone accepts or declines a task you offered", lane: "info", scope: "me",
    match: (row, { user, task }) => is("task", "accepted", "declined")(row) && task(row.task ?? "")?.assignedBy === user,
  }),
  change({
    id: "task-recalled", group: "Tasks", label: "A task offered to you is taken back", lane: "info", scope: "me",
    match: (row, { user }) => is("task", "recalled")(row) && row.from === user,
  }),
  change({
    id: "task-created", group: "Tasks", label: "A task is added for the principal", lane: "info", scope: "principal",
    match: (row) => is("task", "created")(row) && (row.principal ?? "") !== "",
  }),
  change({
    id: "task-completed", group: "Tasks", label: "A task for the principal is done", lane: "info", scope: "principal",
    match: (row) => is("task", "completed")(row) && (row.principal ?? "") !== "",
  }),
  state({ id: "task-overdue", group: "Tasks", label: "A task for the principal is due today or overdue", lane: "needs", scope: "principal" }),
  state({
    id: "prep-due", group: "Diary", label: "A meeting needs prep soon", lane: "needs", scope: "principal",
    amount: { label: "Within", unit: "hours", default: 24, min: 1, max: 336 },
  }),
  state({ id: "gone-no-reason", group: "Diary", label: "A gone meeting with office data has no reason", lane: "needs", scope: "principal" }),
  // One update per sync run, holding the engagements it changed.
  change({ id: "sync-applied", group: "Sync", label: "A sync or import changes the diary", lane: "info", scope: "principal", match: is("import", "applied") }),
  // Late or refused as the Automate page says (OUT-91's principalHealth), so the two never disagree.
  state({ id: "sync-health", group: "Sync", label: "The diary sync is late or a file can't be used", lane: "needs", scope: "principal" }),
];

const BY_ID: ReadonlyMap<string, Rule> = new Map(RULES.map((r) => [r.id, r]));
export const ruleById = (id: string): Rule | undefined => BY_ID.get(id);

/** The built-in rule a coalesce key's update comes from: keys start "<rule>|". */
export const ruleOfKey = (key: string): Rule | undefined => ruleById(key.split("|")[0] ?? "");

/** people.watchOff ids (OUT-58) that have a rule here. prep-changed has none. */
const WATCH_IDS: Readonly<Record<string, string>> = {
  "event-added": "added", "event-moved": "moved", "event-changed": "changed", "event-gone": "gone", "event-returned": "returned",
  "flag-changed": "flagged-changed", "proposal-made": "proposal-made", "proposal-withdrawn": "proposal-withdrawn",
  "proposal-settled": "proposal-settled", "task-offered": "task-offered", "task-answered": "task-answered",
  "task-recalled": "task-recalled", "task-created": "task-created", "task-completed": "task-completed", "import-applied": "sync-applied",
};

export interface RuleSetting {
  on: boolean;
  amount: number;
  surfaces: readonly Surface[];
}

export const defaultSurfaces = (rule: Rule): readonly Surface[] => (rule.lane === "needs" ? SURFACES : ["home"]);

const parseSurfaces = (value: string | undefined): Surface[] | undefined => {
  if (value === undefined || value === "") return undefined;
  const set = new Set(value.split(",").map((s) => s.trim()));
  return SURFACES.filter((s) => set.has(s));
};

/**
 * The user's setting for every built-in rule. A ruleSettings row wins; without
 * one, a rule people.watchOff listed (OUT-58) stays off, and "none" there means
 * the user had every watch rule on. Otherwise the rule's default.
 */
export function settingsFor(user: string, rows: readonly RuleSettingRow[], watchOff: string | undefined): ReadonlyMap<string, RuleSetting> {
  const own = new Map(rows.filter((r) => !r._deleted && r.userId === user).map((r) => [r.rule ?? "", r]));
  const listed = watchOff === undefined || watchOff === "" ? undefined : new Set(watchOff.split(",").map((s) => s.trim()));
  const carried = new Map<string, boolean>();
  if (listed) for (const [old, id] of Object.entries(WATCH_IDS)) carried.set(id, !listed.has(old));
  return new Map(RULES.map((rule) => {
    const row = own.get(rule.id);
    const on = typeof row?.on === "boolean" ? row.on : (carried.get(rule.id) ?? !rule.offByDefault);
    const amount = typeof row?.amount === "number" && rule.amount ? row.amount : (rule.amount?.default ?? 0);
    const surfaces = parseSurfaces(row?.surfaces) ?? defaultSurfaces(rule);
    return [rule.id, { on, amount, surfaces }];
  }));
}
