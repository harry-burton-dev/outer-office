// Updates (v0.3 brief 5.3, OUT-86): what the rules post for one user, worked
// out when read from the log, the diary and the user's rule settings. Nothing
// here is stored; only each user's updateState row for an update key is.
//
// Two lanes. **Needs you**: a state rule's update stands while its cause does,
// and can only be snoozed. **For information**: change rows, coalesced per
// engagement (the net since the user last saw it), then per series, then per
// sync run; seen, dismissed, snoozed or pinned, and gone 14 days after the
// newest change unless pinned. Pure: no hooks.
import type { RowOf } from "@trellis/framework";
import { todayIn } from "./dates";
import { FIRST_LOOK_DAYS, ME } from "./home";
import { isDueToday, isOverdue } from "./selectors";
import type { PrincipalHealth } from "../automate/flows";
import type { Readiness } from "./readiness";
import { RULES, ruleById, type ChangeContext, type Lane, type RuleSetting, type Surface, SURFACES } from "./rules";

type LogRow = RowOf<"log">;
type TaskRow = RowOf<"tasks">;
type EventRow = RowOf<"events">;
type OverlayRow = RowOf<"overlays">;
type SeenRow = RowOf<"seen">;
type UpdateStateRow = RowOf<"updateState">;
type RuleRow = RowOf<"rules">;

export const EXPIRY_DAYS = 14;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** The log note of a Power Automate run starts with this (apply-diary's SYNC_FILE). */
const SYNC_NOTE = "Power Automate sync";

export interface UpdatesInput {
  user: string;
  /** ISO UTC instant. */
  now: string;
  timezone: string;
  dayStart: string;
  dayEnd: string;
  /** The principals Home shows, in order. */
  principals: readonly { id: string }[];
  log: readonly LogRow[];
  tasks: readonly TaskRow[];
  events: readonly EventRow[];
  overlays: readonly OverlayRow[];
  seen: readonly SeenRow[];
  /** Every user's rows: another user's dismissal shows as "dealt with". */
  updateState: readonly UpdateStateRow[];
  /** settingsFor(user, …). */
  settings: ReadonlyMap<string, RuleSetting>;
  /** Each engagement's tab readiness, by event id (readinessByEvent, OUT-88): prep-due reads it. */
  readiness: ReadonlyMap<string, Readiness>;
  /** Each principal's diary sync health, by principal id, from principalHealth (OUT-91). */
  sync: ReadonlyMap<string, SyncHealth>;
  /** Rules users made (D4); only the user's own, switched on, count. */
  ownRules?: readonly RuleRow[];
  /** Cover in force for the user: they also get the absent user's needs-you updates for that principal. */
  covering?: readonly Covering[];
}

/** What the sync-health rule reads of a principal's diary sync. */
export type SyncHealth = Pick<PrincipalHealth, "state" | "reason" | "lastRunAt">;

export interface Covering {
  absent: string;
  principal: string;
  /** settingsFor(absent, …). */
  settings: ReadonlyMap<string, RuleSetting>;
}

/** A user-made rule's update matched under this id; its key starts "own:<record id>|" in the needs lane. */
export const ownRuleId = (row: { id: string }): string => `own:${row.id}`;

/** A user rule's params: { principal: id or "all", amount }. */
export function ownParams(row: RuleRow): { principal: string; amount?: number } {
  try {
    const parsed: unknown = JSON.parse(row.params || "{}");
    const p = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    return { principal: typeof p.principal === "string" && p.principal ? p.principal : "all", ...(typeof p.amount === "number" ? { amount: p.amount } : {}) };
  } catch {
    return { principal: "all" };
  }
}

const ownSurfaces = (row: RuleRow): Surface[] => {
  const set = new Set((row.surfaces ?? "").split(",").map((x) => x.trim()));
  return SURFACES.filter((x) => set.has(x));
};

export interface DealtWith {
  by: string;
  at: string;
}

export interface Update {
  /** The coalesce key: updateState is stored under it. */
  key: string;
  lane: Lane;
  /** A principal id, or ME. */
  scope: string;
  /** The rules it matched, in the order they were first matched. */
  rules: string[];
  /** For a needs-you update, the built-in state rule whose cause stands. */
  cause?: string;
  /** The newest change it holds, or when its cause began ("" when not known). */
  at: string;
  event?: string;
  task?: string;
  /** Change kinds, net: a meeting moved and moved back holds no "moved". */
  kinds: string[];
  /** A net move. */
  from?: string;
  to?: string;
  note?: string;
  /** The change rows it holds, oldest first. */
  rows: LogRow[];
  /** The engagements a series or sync-run update holds. */
  members: Update[];
  pinned: boolean;
  dealtWith?: DealtWith;
  /** Where it shows, from the user's settings for each rule it matched. */
  surfaces: Surface[];
  /** It came through cover for this user. */
  coveringFor?: string;
}

export interface UpdateGroup {
  scope: string;
  /** When the user last marked the scope seen, or "". */
  seenAt: string;
  needs: Update[];
  info: Update[];
}

const live = <T extends { _deleted: boolean }>(row: T) => !row._deleted;
const byAt = (a: LogRow, b: LogRow) => (a.at ?? "").localeCompare(b.at ?? "") || a.id.localeCompare(b.id);
const newestFirst = (a: Update, b: Update) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key);
const runOf = (row: LogRow) => `${row.principal ?? ""}|${row.at ?? ""}|${row.by ?? ""}`;
const subjectOf = (row: LogRow) => (row.event ? `e:${row.event}` : row.task ? `t:${row.task}` : `row:${row.id}`);

/** Occurrences of one series share a UID; a single event has no series. */
const seriesOf = (event: EventRow | undefined): string => (event && event.recurrenceId ? (event.uid ?? "") : "");

const hasOfficeData = (overlay: OverlayRow | undefined): boolean =>
  overlay !== undefined && live(overlay) &&
  (Boolean(overlay.notes?.trim()) || Boolean(overlay.outcome?.trim()) || overlay.flagged === true || (overlay.prep ?? "none") !== "none");

interface Ctx {
  input: UpdatesInput;
  state: ReadonlyMap<string, UpdateStateRow>;
  scopeSeen: ReadonlyMap<string, string>;
  firstLook: string;
}

/** The net of one engagement's rows, or undefined when they cancel out. */
function net(rows: readonly LogRow[]): Pick<Update, "kinds" | "from" | "to"> | undefined {
  const calendarRows = rows.filter((r) => r.area === "calendar");
  const first = calendarRows[0]?.kind;
  let existed = first !== "added" && first !== "returned";
  const before = existed;
  for (const r of calendarRows) {
    if (r.kind === "added" || r.kind === "returned") existed = true;
    if (r.kind === "gone") existed = false;
  }
  const after = existed;
  const moves = calendarRows.filter((r) => r.kind === "moved");
  const from = moves[0]?.from ?? "";
  const to = moves[moves.length - 1]?.to ?? "";
  const moved = moves.length > 0 && from !== to;
  const other = [...new Set(rows.filter((r) => r.area !== "calendar").map((r) => r.kind ?? ""))];
  const changed = calendarRows.some((r) => r.kind === "changed");
  let kinds: string[];
  if (!before && !after) kinds = [];
  else if (!before) kinds = [first === "returned" ? "returned" : "added"];
  else if (!after) kinds = ["gone"];
  else kinds = [...(moved ? ["moved"] : []), ...(changed ? ["changed"] : [])];
  kinds = [...kinds, ...other];
  if (kinds.length === 0) return undefined;
  return { kinds, ...(moved && before && after ? { from, to } : {}) };
}

function dealtWith(ctx: Ctx, key: string, after: string, subject: { event?: string; task?: string }): DealtWith | undefined {
  const { user, log, updateState } = ctx.input;
  const marks = updateState
    .filter((s) => live(s) && s.key === key && s.userId !== user && s.state === "dismissed")
    .map((s) => ({ by: s.userId ?? "", at: s.at ?? "" }));
  const acts = log
    .filter((r) => live(r) && r.by !== user && (r.at ?? "") > after && r.area !== "calendar" && r.area !== "import" &&
      ((subject.event && r.event === subject.event) || (subject.task && r.task === subject.task)))
    .map((r) => ({ by: r.by ?? "", at: r.at ?? "" }));
  return [...marks, ...acts].sort((a, b) => b.at.localeCompare(a.at))[0];
}

interface Matcher {
  id: string;
  scope: "principal" | "me";
  lane: Lane;
  test(row: LogRow): boolean;
}

/** The change rules on for the user, sync-applied aside, and their own change rules. */
function matchers(ctx: Ctx, context: ChangeContext): Matcher[] {
  const { settings } = ctx.input;
  const builtIn = RULES.flatMap((r): Matcher[] =>
    r.kind === "change" && r.id !== "sync-applied" && settings.get(r.id)?.on === true
      ? [{ id: r.id, scope: r.scope, lane: "info", test: (row) => r.match(row, context, settings.get(r.id)?.amount ?? 0) }]
      : []);
  const own = ownRulesOf(ctx).flatMap((row): Matcher[] => {
    const base = ruleById(row.condition ?? "");
    if (base?.kind !== "change" || base.id === "sync-applied") return [];
    const { principal, amount } = ownParams(row);
    const lane: Lane = row.lane === "needs" ? "needs" : "info";
    const test = (r: LogRow) => (principal === "all" || r.principal === principal) && base.match(r, context, amount ?? base.amount?.default ?? 0);
    return [{ id: ownRuleId(row), scope: base.scope, lane, test }];
  });
  return [...builtIn, ...own];
}

const ownRulesOf = (ctx: Ctx): RuleRow[] =>
  (ctx.input.ownRules ?? []).filter((r) => live(r) && r.owner === ctx.input.user && r.on === true);

/** For-information updates, before the user's state hides any. */
function infoUpdates(ctx: Ctx): Update[] {
  const { input } = ctx;
  const { user, log, tasks, events, settings } = input;
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const eventById = new Map(events.map((e) => [e.id, e]));
  const context: ChangeContext = {
    user, task: (id) => taskById.get(id), event: (id) => eventById.get(id),
    timezone: input.timezone, dayStart: input.dayStart, dayEnd: input.dayEnd,
  };
  const rules = matchers(ctx, context);
  const live_ = log.filter(live).sort(byAt);
  // A Power Automate run is nobody's own change, even on the device that applied it.
  const applied = live_.filter((r) => r.area === "import" && r.kind === "applied");
  const syncRuns = new Set(applied.filter((r) => (r.note ?? "").startsWith(SYNC_NOTE)).map(runOf));
  const others = live_.filter((r) => r.by !== user || syncRuns.has(runOf(r)));

  // A subject posts when a rule matches one of its rows; its net reads all of them,
  // diary rows too, so a meeting added then gone is nothing even with the gone rule off.
  // A user's own needs-lane change rule keeps its own update, keyed "own:<id>|<subject>".
  const groups = new Map<string, { scope: string; subject: string; lane: Lane; rows: LogRow[]; rules: string[] }>();
  const allOf = new Map<string, LogRow[]>();
  const hits = new Set<string>();
  for (const row of others) {
    const subject = subjectOf(row);
    allOf.set(subject, [...(allOf.get(subject) ?? []), row]);
    const matched = rules.filter((r) => r.test(row));
    if (matched.length === 0) continue;
    hits.add(row.id);
    for (const m of matched) {
      const key = m.lane === "needs" ? `${m.id}|${subject}` : subject;
      const scope = m.scope === "me" ? ME : (row.principal ?? "");
      const group = groups.get(key) ?? { scope, subject, lane: m.lane, rows: [], rules: [] };
      if (!group.rules.includes(m.id)) group.rules.push(m.id);
      groups.set(key, group);
    }
  }
  for (const group of groups.values()) group.rows = (allOf.get(group.subject) ?? []).filter((r) => hits.has(r.id) || r.area === "calendar");

  const single: Update[] = [];
  for (const [key, group] of groups) {
    const seenAt = seenPoint(ctx, key, group.scope);
    const fresh = group.rows.filter((r) => (r.at ?? "") > seenAt);
    const pinned = ctx.state.get(key)?.state === "pinned";
    const rows = fresh.some((r) => hits.has(r.id)) ? fresh : pinned ? group.rows : [];
    if (rows.length === 0) continue;
    const summary = net(rows);
    if (!summary) continue;
    const last = rows[rows.length - 1];
    const subject = { ...(last.event ? { event: last.event } : {}), ...(last.task ? { task: last.task } : {}) };
    single.push({
      key, lane: group.lane, scope: group.scope, rules: group.rules, at: last.at ?? "", ...subject, ...summary,
      ...(last.note ? { note: last.note } : {}), rows, members: [], pinned, surfaces: [],
    });
  }

  const bySeries = foldSeries(ctx, single.filter((u) => u.lane === "info"), eventById);
  return [...foldRuns(ctx, bySeries, applied), ...single.filter((u) => u.lane === "needs")];
}

/** Two or more engagements of one series become one update. */
function foldSeries(ctx: Ctx, updates: readonly Update[], eventById: ReadonlyMap<string, EventRow>): Update[] {
  const bySeries = new Map<string, Update[]>();
  const rest: Update[] = [];
  for (const u of updates) {
    const series = u.event ? seriesOf(eventById.get(u.event)) : "";
    if (!series) { rest.push(u); continue; }
    const key = `series:${u.scope}:${series}`;
    bySeries.set(key, [...(bySeries.get(key) ?? []), u]);
  }
  for (const [key, members] of bySeries) {
    if (members.length === 1) { rest.push(members[0]); continue; }
    rest.push(container(ctx, key, members, []));
  }
  return rest;
}

/** The engagements one sync run alone changed become its sync-applied update. */
function foldRuns(ctx: Ctx, updates: Update[], applied: readonly LogRow[]): Update[] {
  if (ctx.input.settings.get("sync-applied")?.on !== true) return updates;
  const user = ctx.input.user;
  const runs = new Map(applied.filter((r) => r.by !== user || (r.note ?? "").startsWith(SYNC_NOTE)).map((r) => [runOf(r), r]));
  const byRun = new Map<string, Update[]>();
  const rest: Update[] = [];
  for (const u of updates) {
    const all = [...u.rows, ...u.members.flatMap((m) => m.rows)];
    const one = new Set(all.map(runOf));
    const run = one.size === 1 ? [...one][0] : "";
    if (run && runs.has(run)) byRun.set(run, [...(byRun.get(run) ?? []), u]);
    else rest.push(u);
  }
  for (const [run, row] of runs) {
    const members = byRun.get(run) ?? [];
    if (members.length === 1) { rest.push(members[0]); continue; }
    const scope = row.principal ?? "";
    const key = `run:${scope}:${row.at ?? ""}`;
    const seenAt = seenPoint(ctx, key, scope);
    const pinned = ctx.state.get(key)?.state === "pinned";
    if ((row.at ?? "") <= seenAt && !pinned && members.length === 0) continue;
    rest.push({ ...container(ctx, key, members, [row]), rules: ["sync-applied"], note: row.note ?? "" });
  }
  return rest;
}

function container(ctx: Ctx, key: string, members: Update[], rows: LogRow[]): Update {
  const scope = members[0]?.scope ?? rows[0]?.principal ?? "";
  const at = [...members.map((m) => m.at), ...rows.map((r) => r.at ?? "")].sort().pop() ?? "";
  const rules = [...new Set(members.flatMap((m) => m.rules))];
  const kinds = [...new Set(members.flatMap((m) => m.kinds))];
  return { key, lane: "info", scope, rules, at, kinds, rows, members: [...members].sort(newestFirst), pinned: ctx.state.get(key)?.state === "pinned", surfaces: [] };
}

/** The user saw an update up to here: the scope's "mark all seen", or the update's own seen or dismissed. */
function seenPoint(ctx: Ctx, key: string, scope: string): string {
  const own = ctx.state.get(key);
  const marked = own && (own.state === "seen" || own.state === "dismissed") ? (own.at ?? "") : "";
  const scopeAt = ctx.scopeSeen.get(scope) || ctx.firstLook;
  return marked > scopeAt ? marked : scopeAt;
}

/** Needs-you updates: one per standing cause, under the given user's settings. */
function needsUpdates(ctx: Ctx, settings: ReadonlyMap<string, RuleSetting>, user = ctx.input.user): Update[] {
  const { input } = ctx;
  const { now, sync } = input;
  const on = (id: string) => settings.get(id)?.on === true;
  const amount = (id: string) => settings.get(id)?.amount ?? 0;
  const principals = new Set(input.principals.map((p) => p.id));
  const today = todayIn(input.timezone, now);
  const overlayOf = new Map(input.overlays.filter(live).map((o) => [o.event ?? "", o]));
  const openTasks = input.tasks.filter((t) => live(t) && t.done !== true);
  const linked = new Set(input.tasks.filter(live).map((t) => t.event).filter((e): e is string => Boolean(e)));
  const events = input.events.filter((e) => live(e) && principals.has(e.principal ?? ""));
  const out: Update[] = [];
  const add = (rule: string, scope: string, subject: string, at: string, extra: Partial<Update> = {}) =>
    out.push({ key: `${rule}|${subject}`, lane: "needs", scope, rules: [rule], cause: rule, at, kinds: [], rows: [], members: [], pinned: false, surfaces: [], ...extra });

  if (on("task-overdue")) {
    for (const t of openTasks) {
      // Due today counts too, as Needs action showed it before (OUT-58).
      if (!principals.has(t.principal ?? "") || !(isOverdue(t, today) || isDueToday(t, today))) continue;
      add("task-overdue", t.principal ?? "", t.id, [t.due, t.deadline].filter(Boolean).sort()[0] ?? "", { task: t.id });
    }
  }
  if (on("task-offered")) {
    for (const t of openTasks) {
      if (t.assignee !== user || t.assignment !== "offered" || t.assignedBy === user) continue;
      add("task-offered", ME, t.id, "", { task: t.id });
    }
  }
  if (on("prep-due")) {
    const from = Date.parse(now);
    const until = from + amount("prep-due") * HOUR_MS;
    for (const e of events) {
      const start = Date.parse(e.start ?? "");
      // A tab with required cards not yet complete (v0.3 brief 5.3); overlay.prep is retired.
      if (e.gone || input.readiness.get(e.id)?.ready !== false || !(start >= from && start < until)) continue;
      add("prep-due", e.principal ?? "", e.id, e.start ?? "", { event: e.id });
    }
  }
  if (on("gone-no-reason")) {
    for (const e of events) {
      const overlay = overlayOf.get(e.id);
      if (e.gone !== true || overlay?.archived || !(hasOfficeData(overlay) || linked.has(e.id))) continue;
      add("gone-no-reason", e.principal ?? "", e.id, e.start ?? "", { event: e.id });
    }
  }
  if (on("sync-health")) {
    for (const p of input.principals) {
      const h = sync.get(p.id);
      if (h?.state === "late") add("sync-health", p.id, p.id, h.lastRunAt ?? "", { kinds: ["late"] });
      else if (h?.state === "refused") add("sync-health", p.id, p.id, h.lastRunAt ?? "", { kinds: ["refused"], note: h.reason ?? "" });
    }
  }
  return out;
}

/** Built-in state rules, the user's own state rules, then what cover brings, one update per key. */
function stateUpdates(ctx: Ctx): Update[] {
  const byKey = new Map<string, Update>();
  const take = (list: readonly Update[], extra: (u: Update) => Partial<Update> = () => ({})) => {
    for (const u of list) {
      const had = byKey.get(u.key);
      if (had) { for (const r of u.rules) if (!had.rules.includes(r)) had.rules.push(r); continue; }
      byKey.set(u.key, { ...u, rules: [...u.rules], ...extra(u) });
    }
  };
  take(needsUpdates(ctx, ctx.input.settings));
  for (const row of ownRulesOf(ctx)) {
    const base = ruleById(row.condition ?? "");
    if (base?.kind !== "state") continue;
    const { principal, amount } = ownParams(row);
    const only = new Map(RULES.map((r) => [r.id, { on: r.id === base.id, amount: amount ?? r.amount?.default ?? 0, surfaces: [] }]));
    take(needsUpdates(ctx, only).filter((u) => principal === "all" || u.scope === principal).map((u) => ({ ...u, rules: [ownRuleId(row)] })));
  }
  for (const c of ctx.input.covering ?? []) {
    take(needsUpdates(ctx, c.settings, c.absent).filter((u) => u.scope === c.principal), () => ({ coveringFor: c.absent }));
  }
  return [...byKey.values()];
}

function surfacesOf(ctx: Ctx, u: Update): Surface[] {
  const own = new Map(ownRulesOf(ctx).map((r) => [ownRuleId(r), r]));
  const cover = u.coveringFor !== undefined ? ctx.input.covering?.find((c) => c.absent === u.coveringFor)?.settings : undefined;
  const set = new Set<Surface>();
  for (const id of u.rules) {
    const row = own.get(id);
    const from = row ? ownSurfaces(row) : ((cover ?? ctx.input.settings).get(id)?.surfaces ?? []);
    for (const x of from) set.add(x);
  }
  return SURFACES.filter((x) => set.has(x));
}

/** Every update for the user, one group per principal (in order) and "For you" last. */
export function updatesFor(input: UpdatesInput): UpdateGroup[] {
  const { user, now } = input;
  const state = new Map(input.updateState.filter((s) => live(s) && s.userId === user).map((s) => [s.key ?? "", s]));
  const scopeSeen = new Map(input.seen.filter((s) => live(s) && s.userId === user).map((s) => [s.scope ?? "", s.at ?? ""]));
  const firstLook = new Date(Date.parse(now) - FIRST_LOOK_DAYS * DAY_MS).toISOString();
  const ctx: Ctx = { input, state, scopeSeen, firstLook };
  const expiry = new Date(Date.parse(now) - EXPIRY_DAYS * DAY_MS).toISOString();
  const snoozed = (u: Update) => {
    const s = state.get(u.key);
    return s?.state === "snoozed" && (s.until ?? "") > now;
  };
  const withDealt = (u: Update): Update => {
    const d = dealtWith(ctx, u.key, u.at, u);
    return d ? { ...u, dealtWith: d } : u;
  };
  const all = infoUpdates(ctx);
  const info = all.filter((u) => u.lane === "info" && !snoozed(u) && (u.pinned || u.at >= expiry));
  const needs = [...stateUpdates(ctx), ...all.filter((u) => u.lane === "needs")].filter((u) => !snoozed(u));
  const surfaced = (u: Update): Update => ({ ...withDealt(u), surfaces: surfacesOf(ctx, u) });
  const scopes = [...input.principals.map((p) => p.id), ME];
  return scopes.map((scope) => ({
    scope,
    seenAt: scopeSeen.get(scope) ?? "",
    needs: needs.filter((u) => u.scope === scope).map(surfaced),
    info: info.filter((u) => u.scope === scope).sort(newestFirst).map(surfaced),
  }));
}

/**
 * What one rule would have posted over the last week (FIRST_LOOK_DAYS) of the
 * stored log, for the Alerts preview (B31): as if the user had never looked
 * and nothing else were on. State rules show what stands now.
 */
export function previewRule(input: UpdatesInput, rule: string): Update[] {
  const own = (input.ownRules ?? []).find((r) => ownRuleId(r) === rule);
  const settings = new Map([...input.settings].map(([id, s]) => [id, { ...s, on: !own && id === rule }]));
  const groups = updatesFor({
    ...input, settings, seen: [], updateState: [], covering: [],
    ownRules: own ? [{ ...own, on: true }] : [],
  });
  return groups.flatMap((g) => [...g.needs, ...g.info]);
}
