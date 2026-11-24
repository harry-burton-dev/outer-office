// Home: what changed since a user last looked, as a per-user view over the
// log (OUT-58). The watch rules say which log rows a user wants to see; each
// rule is on unless the user turned it off. A user never sees their own
// changes. Pure: no hooks.
import type { RowOf } from "@trellis/framework";

export type LogRow = RowOf<"log">;
export type SeenRow = RowOf<"seen">;
type TaskRow = RowOf<"tasks">;

/** The scope of the user's own tasks, beside one scope per principal. */
export const ME = "me";

/** How far back Home looks for a scope the user has never marked as seen. */
export const FIRST_LOOK_DAYS = 7;
const DAY_MS = 86_400_000;

export type RuleGroup = "Diary" | "Prep" | "Proposals" | "Tasks for you" | "The principal's tasks" | "Imports";

interface RuleContext {
  user: string;
  /** The task a row names, if it has arrived. */
  task(id: string): TaskRow | undefined;
}

export interface WatchRule {
  readonly id: string;
  readonly group: RuleGroup;
  readonly label: string;
  /** Rows for the user's own tasks go under "me"; the rest under the row's principal. */
  readonly scope: "principal" | "me";
  /** Off until the user turns it on. */
  readonly offByDefault?: boolean;
  match(row: LogRow, context: RuleContext): boolean;
}

const is = (area: string, ...kinds: string[]) => (row: LogRow) => row.area === area && kinds.includes(row.kind ?? "");

export const WATCH_RULES: readonly WatchRule[] = [
  { id: "event-added", group: "Diary", label: "A meeting is added", scope: "principal", match: is("calendar", "added") },
  { id: "event-moved", group: "Diary", label: "A meeting moves", scope: "principal", match: is("calendar", "moved") },
  { id: "event-changed", group: "Diary", label: "A meeting's details change", scope: "principal", match: is("calendar", "changed") },
  { id: "event-gone", group: "Diary", label: "A meeting is gone from Outlook", scope: "principal", match: is("calendar", "gone") },
  { id: "event-returned", group: "Diary", label: "A gone meeting comes back", scope: "principal", match: is("calendar", "returned") },
  { id: "prep-changed", group: "Prep", label: "Prep changes", scope: "principal", match: is("overlay", "prep") },
  { id: "flag-changed", group: "Prep", label: "A meeting is flagged or unflagged", scope: "principal", match: is("overlay", "flag") },
  { id: "proposal-made", group: "Proposals", label: "A move or new meeting is proposed", scope: "principal", match: is("proposal", "move", "new") },
  { id: "proposal-withdrawn", group: "Proposals", label: "A proposal is withdrawn", scope: "principal", match: is("proposal", "withdraw") },
  { id: "proposal-settled", group: "Proposals", label: "A proposal shows up in Outlook", scope: "principal", match: is("proposal", "settled") },
  {
    id: "task-offered", group: "Tasks for you", label: "A task is offered to you", scope: "me",
    match: (row, { user }) => is("task", "assigned")(row) && row.to === user,
  },
  {
    id: "task-answered", group: "Tasks for you", label: "Someone accepts or declines a task you offered", scope: "me",
    match: (row, { user, task }) => is("task", "accepted", "declined")(row) && task(row.task ?? "")?.assignedBy === user,
  },
  {
    id: "task-recalled", group: "Tasks for you", label: "A task offered to you is taken back", scope: "me",
    match: (row, { user }) => is("task", "recalled")(row) && row.from === user,
  },
  {
    id: "task-created", group: "The principal's tasks", label: "A task is added for the principal", scope: "principal",
    match: (row) => is("task", "created")(row) && (row.principal ?? "") !== "",
  },
  {
    id: "task-completed", group: "The principal's tasks", label: "A task for the principal is done", scope: "principal",
    match: (row) => is("task", "completed")(row) && (row.principal ?? "") !== "",
  },
  { id: "import-applied", group: "Imports", label: "An import is applied", scope: "principal", offByDefault: true, match: is("import", "applied") },
];

const RULE_IDS: ReadonlySet<string> = new Set(WATCH_RULES.map((r) => r.id));
export const isRuleId = (id: string): boolean => RULE_IDS.has(id);

/** The rules a user has on, from people.watchOff: "" means the defaults, otherwise it lists every rule that is off ("none" when none is). */
export function rulesOn(watchOff: string | undefined): ReadonlySet<string> {
  if (watchOff === undefined || watchOff === "") return new Set(WATCH_RULES.filter((r) => !r.offByDefault).map((r) => r.id));
  const off = new Set(watchOff.split(",").map((s) => s.trim()));
  return new Set(WATCH_RULES.filter((r) => !off.has(r.id)).map((r) => r.id));
}

/** people.watchOff for a set of rules that are on. Always lists every off rule, so defaults never shift under a user. */
export function watchOffFor(on: ReadonlySet<string>): string {
  const off = WATCH_RULES.filter((r) => !on.has(r.id)).map((r) => r.id);
  return off.length === 0 ? "none" : off.join(",");
}

export const seenId = (user: string, scope: string): readonly [string, string, string] => ["seen", user, scope];

export interface HomeInput {
  user: string;
  log: readonly LogRow[];
  tasks: readonly TaskRow[];
  seen: readonly SeenRow[];
  /** people.watchOff for the user. */
  watchOff: string | undefined;
  /** The principals Home shows, in order. */
  principals: readonly { id: string }[];
  /** ISO UTC instant. */
  now: string;
}

export interface HomeGroup {
  /** A principal id, or ME. */
  scope: string;
  /** When the user last marked this scope as seen, or "" when never. */
  seenAt: string;
  /** Rows since then, newest first. */
  rows: LogRow[];
}

const newestFirst = (a: LogRow, b: LogRow) => (b.at ?? "").localeCompare(a.at ?? "") || b.id.localeCompare(a.id);

/** What changed since the user last looked: one group per principal (in order) and one for the user's own tasks, last. */
export function homeChanges(input: HomeInput): HomeGroup[] {
  const { user, log, tasks, seen, watchOff, principals, now } = input;
  const on = WATCH_RULES.filter((r) => rulesOn(watchOff).has(r.id));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const context: RuleContext = { user, task: (id) => taskById.get(id) };
  const seenAt = new Map(seen.filter((s) => !s._deleted && s.userId === user).map((s) => [s.scope ?? "", s.at ?? ""]));
  const firstLook = new Date(Date.parse(now) - FIRST_LOOK_DAYS * DAY_MS).toISOString();
  const scopes = [...principals.map((p) => p.id), ME];
  const groups = new Map<string, LogRow[]>(scopes.map((s) => [s, []]));
  for (const row of log) {
    if (row._deleted || row.by === user) continue;
    const rule = on.find((r) => r.match(row, context));
    if (!rule) continue;
    const scope = rule.scope === "me" ? ME : (row.principal ?? "");
    const since = seenAt.get(scope) || firstLook;
    if ((row.at ?? "") > since) groups.get(scope)?.push(row);
  }
  return scopes.map((scope) => ({ scope, seenAt: seenAt.get(scope) ?? "", rows: (groups.get(scope) ?? []).sort(newestFirst) }));
}
