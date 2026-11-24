// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { RowOf } from "@trellis/framework";
import { ME } from "./home";
import { RULES, settingsFor } from "./rules";
import { updatesFor, type UpdatesInput } from "./updates";

type Log = RowOf<"log">;
type Ev = RowOf<"events">;

const meta = (id: string) => ({ id, _deleted: false, _conflicts: {} });
let n = 0;
const log = (over: Partial<Log>): Log => ({ ...meta(`log-${++n}`), by: "user-b", principal: "p-a", area: "calendar", kind: "changed", event: "", task: "", from: "", to: "", note: "", ...over }) as Log;
const ev = (id: string, over: Partial<Ev> = {}): Ev => ({ ...meta(id), principal: "p-a", uid: id, recurrenceId: "", start: "2026-11-30T10:00:00Z", gone: false, ...over }) as Ev;
const state = (key: string, s: string, over: Partial<RowOf<"updateState">> = {}) =>
  ({ ...meta(`st-${key}-${over.userId ?? "user-a"}`), userId: "user-a", key, state: s, until: "", at: NOW, ...over }) as RowOf<"updateState">;

const NOW = "2026-11-24T12:00:00.000Z";
const T = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString();

function input(over: Partial<UpdatesInput> = {}): UpdatesInput {
  return {
    user: "user-a", now: NOW, timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00",
    principals: [{ id: "p-a" }], log: [], tasks: [], events: [], overlays: [], seen: [], updateState: [],
    settings: settingsFor("user-a", [], undefined), sync: { on: false, last: new Map(), heldBack: new Map() },
    ...over,
  };
}
const group = (i: UpdatesInput, scope = "p-a") => updatesFor(i).find((g) => g.scope === scope)!;

describe("settingsFor", () => {
  test("defaults: every rule on except gone and out-of-hours", () => {
    const s = settingsFor("user-a", [], undefined);
    expect(RULES.filter((r) => !s.get(r.id)?.on).map((r) => r.id).sort()).toEqual(["gone", "out-of-hours"]);
    expect(s.get("prep-due")?.amount).toBe(24);
    expect(s.get("short-notice")?.amount).toBe(72);
    expect(s.get("sync-late")?.surfaces).toEqual(["home", "needs", "badge"]);
    expect(s.get("added")?.surfaces).toEqual(["home"]);
  });

  test("carries people.watchOff over: what it listed stays off, and 'none' turns gone on", () => {
    const s = settingsFor("user-a", [], "event-moved,import-applied");
    expect(s.get("moved")?.on).toBe(false);
    expect(s.get("sync-applied")?.on).toBe(false);
    expect(s.get("gone")?.on).toBe(true);
    expect(s.get("added")?.on).toBe(true);
    expect(settingsFor("user-a", [], "none").get("gone")?.on).toBe(true);
  });

  test("a ruleSettings row wins over watchOff, and only the user's own rows count", () => {
    const rows = [
      { ...meta("r1"), userId: "user-a", rule: "moved", on: true, amount: 0, surfaces: "" },
      { ...meta("r2"), userId: "user-b", rule: "added", on: false, amount: 0, surfaces: "" },
      { ...meta("r3"), userId: "user-a", rule: "prep-due", amount: 6, surfaces: "home" },
    ] as RowOf<"ruleSettings">[];
    const s = settingsFor("user-a", rows, "event-moved");
    expect(s.get("moved")?.on).toBe(true);
    expect(s.get("added")?.on).toBe(true);
    expect(s.get("prep-due")).toEqual({ on: true, amount: 6, surfaces: ["home"] });
  });
});

describe("for information: coalescing", () => {
  test("three changes to one engagement give one net update (B25)", () => {
    const rows = [
      log({ at: T(5), kind: "moved", event: "e1", from: "2026-11-30T10:00:00Z", to: "2026-11-30T11:00:00Z" }),
      log({ at: T(4), kind: "changed", event: "e1", note: "Changed: location" }),
      log({ at: T(3), kind: "moved", event: "e1", from: "2026-11-30T11:00:00Z", to: "2026-11-30T15:00:00Z" }),
    ];
    const { info } = group(input({ log: rows, events: [ev("e1")] }));
    expect(info).toHaveLength(1);
    expect(info[0]).toMatchObject({ key: "e:e1", kinds: ["moved", "changed"], from: "2026-11-30T10:00:00Z", to: "2026-11-30T15:00:00Z", at: T(3) });
  });

  test("a move and a move back cancel out; added then gone is nothing", () => {
    const rows = [
      log({ at: T(5), kind: "moved", event: "e1", from: "A", to: "B" }),
      log({ at: T(4), kind: "moved", event: "e1", from: "B", to: "A" }),
      log({ at: T(5), kind: "added", event: "e2" }),
      log({ at: T(4), kind: "gone", event: "e2" }),
    ];
    expect(group(input({ log: rows })).info).toEqual([]);
  });

  test("only changes since the user last saw it make up the net", () => {
    const rows = [
      log({ at: T(5), kind: "moved", event: "e1", from: "A", to: "B" }),
      log({ at: T(3), kind: "moved", event: "e1", from: "B", to: "C" }),
    ];
    const seen = [{ ...meta("s"), userId: "user-a", scope: "p-a", at: T(4) }] as RowOf<"seen">[];
    expect(group(input({ log: rows, seen })).info[0]).toMatchObject({ from: "B", to: "C" });
  });

  test("a sync that moves 30 engagements gives one sync-applied update (B25)", () => {
    const at = T(2);
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => log({ at, kind: "moved", event: `e${i}`, from: "A", to: "B" })),
      log({ at, area: "import", kind: "applied", note: "Power Automate sync: 0 added, 30 changed, 0 gone, 0 returned" }),
    ];
    const { info } = group(input({ log: rows }));
    expect(info).toHaveLength(1);
    expect(info[0]).toMatchObject({ key: `run:p-a:${at}`, rules: ["sync-applied"] });
    expect(info[0].members).toHaveLength(30);
  });

  test("a Power Automate run counts even when the user's own device applied it; their own manual import does not", () => {
    const rows = [
      log({ at: T(2), by: "user-a", kind: "moved", event: "e1", from: "A", to: "B" }),
      log({ at: T(2), by: "user-a", kind: "moved", event: "e2", from: "A", to: "B" }),
      log({ at: T(2), by: "user-a", area: "import", kind: "applied", note: "Power Automate sync: 2 changed" }),
      log({ at: T(1), by: "user-a", kind: "moved", event: "e3", from: "A", to: "B" }),
      log({ at: T(1), by: "user-a", area: "import", kind: "applied", note: "diary.ics: 1 changed" }),
    ];
    const { info } = group(input({ log: rows }));
    expect(info.map((u) => u.key)).toEqual([`run:p-a:${T(2)}`]);
  });

  test("engagements a run changed alongside other changes keep their own update", () => {
    const at = T(2);
    const rows = [
      log({ at: T(3), area: "overlay", kind: "flag", event: "e1" }),
      log({ at, kind: "moved", event: "e1", from: "A", to: "B" }),
      log({ at, kind: "moved", event: "e2", from: "A", to: "B" }),
      log({ at, kind: "moved", event: "e3", from: "A", to: "B" }),
      log({ at, area: "import", kind: "applied", note: "Power Automate sync" }),
    ];
    const { info } = group(input({ log: rows }));
    expect(info.map((u) => [u.key, u.members.length]).sort()).toEqual([["e:e1", 0], [`run:p-a:${at}`, 2]]);
  });

  test("occurrences of one series give one update", () => {
    const events = [ev("o1", { uid: "S", recurrenceId: "1" }), ev("o2", { uid: "S", recurrenceId: "2" }), ev("x")];
    const rows = [
      log({ at: T(3), kind: "changed", event: "o1" }),
      log({ at: T(2), kind: "changed", event: "o2" }),
      log({ at: T(1), kind: "changed", event: "x" }),
    ];
    const { info } = group(input({ log: rows, events }));
    expect(info.map((u) => [u.key, u.members.length])).toEqual([["e:x", 0], ["series:p-a:S", 2]]);
  });

  test("the user's own changes never show, and a switched-off rule posts nothing", () => {
    const rows = [log({ at: T(2), by: "user-a", kind: "added", event: "e1" }), log({ at: T(2), kind: "gone", event: "e2" })];
    expect(group(input({ log: rows })).info).toEqual([]);
  });

  test("short-notice and out-of-hours match an added or moved meeting by its new start", () => {
    const settings = settingsFor("user-a", [{ ...meta("x"), userId: "user-a", rule: "out-of-hours", on: true } as RowOf<"ruleSettings">], undefined);
    const rows = [
      log({ at: T(1), kind: "moved", event: "soon", from: "2026-12-20T10:00:00Z", to: "2026-11-25T10:00:00Z" }),
      log({ at: T(1), kind: "moved", event: "late", from: "2026-12-20T10:00:00Z", to: "2026-12-20T19:30:00Z" }),
    ];
    const { info } = group(input({ log: rows, settings }));
    const rulesOf = (key: string) => info.find((u) => u.key === key)?.rules;
    expect(rulesOf("e:soon")).toEqual(["moved", "short-notice"]);
    expect(rulesOf("e:late")).toEqual(["moved", "out-of-hours"]);
  });
});

describe("for information: the user's state", () => {
  const rows = [log({ at: T(3), kind: "moved", event: "e1", from: "A", to: "B" })];

  test("dismissed or seen hides it until a newer change; snoozed hides it until the time", () => {
    expect(group(input({ log: rows, updateState: [state("e:e1", "dismissed", { at: T(3) })] })).info).toEqual([]);
    expect(group(input({ log: rows, updateState: [state("e:e1", "seen", { at: T(3) })] })).info).toEqual([]);
    const newer = [...rows, log({ at: T(1), kind: "changed", event: "e1" })];
    expect(group(input({ log: newer, updateState: [state("e:e1", "dismissed", { at: T(3) })] })).info[0].kinds).toEqual(["changed"]);
    expect(group(input({ log: rows, updateState: [state("e:e1", "snoozed", { until: T(-1) })] })).info).toEqual([]);
    expect(group(input({ log: rows, updateState: [state("e:e1", "snoozed", { until: T(1) })] })).info).toHaveLength(1);
  });

  test("expires 14 days after its newest change unless pinned; pinned outlasts mark all seen", () => {
    const old = [log({ at: T(15 * 24), kind: "moved", event: "e1", from: "A", to: "B" })];
    const seen = [{ ...meta("s"), userId: "user-a", scope: "p-a", at: T(15 * 24 - 1) }] as RowOf<"seen">[];
    expect(group(input({ log: old, seen: [] })).info).toEqual([]);
    const pinned = group(input({ log: old, seen, updateState: [state("e:e1", "pinned")] })).info;
    expect(pinned).toHaveLength(1);
    expect(pinned[0].pinned).toBe(true);
  });

  test("another user's dismissal, or their log row on the engagement after it, shows as dealt with", () => {
    const other = state("e:e1", "dismissed", { userId: "user-c", at: T(2) });
    expect(group(input({ log: rows, updateState: [other] })).info[0].dealtWith).toEqual({ by: "user-c", at: T(2) });
    const acted = [...rows, log({ at: T(1), by: "user-c", area: "overlay", kind: "prep", event: "e1" })];
    const prepOff = settingsFor("user-a", [], undefined);
    expect(group(input({ log: acted, settings: prepOff })).info[0].dealtWith).toEqual({ by: "user-c", at: T(1) });
  });
});

describe("needs you", () => {
  const overlay = (event: string, over: Partial<RowOf<"overlays">>) => ({ ...meta(`o-${event}`), event, prep: "none", flagged: false, ...over }) as RowOf<"overlays">;

  test("each state rule posts while its cause stands, under the right scope", () => {
    const i = input({
      tasks: [
        { ...meta("late"), principal: "p-a", due: "2026-11-20", done: false } as RowOf<"tasks">,
        { ...meta("offer"), assignee: "user-a", assignedBy: "user-b", assignment: "offered", done: false } as RowOf<"tasks">,
        { ...meta("mine"), assignee: "user-a", assignedBy: "user-a", assignment: "accepted", done: false } as RowOf<"tasks">,
      ],
      events: [ev("soon", { start: "2026-11-25T09:00:00Z" }), ev("far", { start: "2026-11-27T09:00:00Z" }), ev("gone", { gone: true })],
      overlays: [overlay("soon", { prep: "needed" }), overlay("far", { prep: "needed" }), overlay("gone", { notes: "Keep" })],
      sync: { on: true, last: new Map([["p-a", T(30)]]), heldBack: new Map([["p-a", "it would mark 9 of 10 events gone"]]) },
    });
    const groups = updatesFor(i);
    expect(groups.find((g) => g.scope === "p-a")!.needs.map((u) => u.key).sort()).toEqual([
      "gone-no-reason|gone", "prep-due|soon", "sync-held-back|p-a", "sync-late|p-a", "task-overdue|late",
    ]);
    expect(groups.find((g) => g.scope === ME)!.needs.map((u) => u.key)).toEqual(["task-offered|offer"]);
  });

  test("fixing the cause removes it (B26): archived, prep done, synced, answered", () => {
    const i = input({
      tasks: [{ ...meta("offer"), assignee: "user-a", assignedBy: "user-b", assignment: "accepted", done: false } as RowOf<"tasks">],
      events: [ev("soon", { start: "2026-11-25T09:00:00Z" }), ev("gone", { gone: true })],
      overlays: [overlay("soon", { prep: "done" }), overlay("gone", { notes: "Keep", archived: T(1), archiveReason: "cancelled" })],
      sync: { on: true, last: new Map([["p-a", T(1)]]), heldBack: new Map() },
    });
    expect(updatesFor(i).flatMap((g) => g.needs)).toEqual([]);
  });

  test("snoozed until a time; dismissing state is ignored; sync-late needs the sync on", () => {
    const sync = { on: true, last: new Map<string, string>(), heldBack: new Map<string, string>() };
    expect(group(input({ sync })).needs.map((u) => u.key)).toEqual(["sync-late|p-a"]);
    expect(group(input({ sync, updateState: [state("sync-late|p-a", "snoozed", { until: T(-1) })] })).needs).toEqual([]);
    expect(group(input({ sync, updateState: [state("sync-late|p-a", "dismissed")] })).needs).toHaveLength(1);
    expect(group(input({ sync: { ...sync, on: false } })).needs).toEqual([]);
  });
});

describe("each built-in change rule", () => {
  const on = (...ids: string[]) =>
    settingsFor("user-a", ids.map((rule) => ({ ...meta(`rs-${rule}`), userId: "user-a", rule, on: true }) as RowOf<"ruleSettings">), undefined);
  const keys = (rows: Log[], over: Partial<UpdatesInput> = {}, scope = "p-a") => group(input({ log: rows, ...over }), scope).info.map((u) => u.key).sort();

  test("short-notice follows its amount and ignores a start already past", () => {
    const tuned = settingsFor("user-a", [{ ...meta("rs"), userId: "user-a", rule: "short-notice", amount: 12 } as RowOf<"ruleSettings">], undefined);
    const rows = [
      log({ at: NOW, kind: "moved", event: "in", from: "A", to: "2026-11-24T23:00:00.000Z" }),
      log({ at: NOW, kind: "moved", event: "out", from: "A", to: "2026-11-25T01:00:00.000Z" }),
      log({ at: NOW, kind: "moved", event: "past", from: "A", to: "2026-11-24T09:00:00.000Z" }),
    ];
    const short = group(input({ log: rows, settings: tuned })).info.filter((u) => u.rules.includes("short-notice")).map((u) => u.key);
    expect(short).toEqual(["e:in"]);
  });

  test("out-of-hours: a start at the end of the day is out, at its start is in", () => {
    const rows = [
      log({ at: T(1), kind: "moved", event: "end", from: "A", to: "2026-12-01T18:00:00.000Z" }),
      log({ at: T(1), kind: "moved", event: "start", from: "A", to: "2026-12-01T08:00:00.000Z" }),
      log({ at: T(1), kind: "moved", event: "early", from: "A", to: "2026-12-01T07:59:00.000Z" }),
    ];
    const out = group(input({ log: rows, settings: on("out-of-hours") })).info.filter((u) => u.rules.includes("out-of-hours")).map((u) => u.key).sort();
    expect(out).toEqual(["e:early", "e:end"]);
  });

  test("gone, when on, posts the meeting as gone", () => {
    const { info } = group(input({ log: [log({ at: T(1), kind: "gone", event: "e1" })], settings: on("gone") }));
    expect(info[0]).toMatchObject({ key: "e:e1", kinds: ["gone"], rules: ["gone"] });
  });

  test("returned posts a meeting back from gone; added posts a new one", () => {
    const rows = [log({ at: T(2), kind: "gone", event: "r" }), log({ at: T(1), kind: "returned", event: "r" }), log({ at: T(1), kind: "added", event: "a" })];
    const seen = [{ ...meta("s"), userId: "user-a", scope: "p-a", at: T(1.5) }] as RowOf<"seen">[];
    expect(group(input({ log: rows, seen })).info.map((u) => [u.key, u.rules])).toEqual([["e:a", ["added"]], ["e:r", ["returned"]]]);
  });

  test("flags, proposals made, withdrawn and settled", () => {
    const rows = [
      log({ at: T(1), area: "overlay", kind: "flag", event: "f" }),
      log({ at: T(1), area: "proposal", kind: "new", event: "n" }),
      log({ at: T(1), area: "proposal", kind: "move", event: "m" }),
      log({ at: T(1), area: "proposal", kind: "withdraw", event: "w" }),
      log({ at: T(1), area: "proposal", kind: "settled", event: "s" }),
      log({ at: T(1), area: "overlay", kind: "prep", event: "p" }),
    ];
    expect(keys(rows)).toEqual(["e:f", "e:m", "e:n", "e:s", "e:w"]);
  });

  test("task rules: answered and recalled for you; created and completed only for a principal's task", () => {
    const tasks = [
      { ...meta("mine"), assignedBy: "user-a" } as RowOf<"tasks">,
      { ...meta("theirs"), assignedBy: "user-c" } as RowOf<"tasks">,
    ];
    const rows = [
      log({ at: T(1), area: "task", kind: "accepted", task: "mine", principal: "" }),
      log({ at: T(1), area: "task", kind: "declined", task: "theirs", principal: "" }),
      log({ at: T(1), area: "task", kind: "recalled", task: "r1", from: "user-a", principal: "" }),
      log({ at: T(1), area: "task", kind: "recalled", task: "r2", to: "user-a", from: "user-c", principal: "" }),
      log({ at: T(1), area: "task", kind: "created", task: "c1" }),
      log({ at: T(1), area: "task", kind: "created", task: "c2", principal: "" }),
      log({ at: T(1), area: "task", kind: "completed", task: "d1" }),
      log({ at: T(1), area: "task", kind: "completed", task: "d2", principal: "" }),
    ];
    expect(keys(rows, { tasks }, ME)).toEqual(["t:mine", "t:r1"]);
    expect(keys(rows, { tasks })).toEqual(["t:c1", "t:d1"]);
  });

  test("the user's own later row on the engagement is not 'dealt with'", () => {
    const rows = [log({ at: T(3), kind: "moved", event: "e1", from: "A", to: "B" }), log({ at: T(1), by: "user-a", area: "overlay", kind: "prep", event: "e1" })];
    expect(group(input({ log: rows })).info[0].dealtWith).toBeUndefined();
  });
});

describe("each built-in state rule", () => {
  test("task-overdue is the principal's own: another principal's or an untagged task stays out", () => {
    const tasks = [
      { ...meta("a"), principal: "p-a", due: "2026-11-20", done: false },
      { ...meta("b"), principal: "p-b", due: "2026-11-20", done: false },
      { ...meta("none"), due: "2026-11-20", done: false },
      { ...meta("done"), principal: "p-a", due: "2026-11-20", done: true },
    ] as RowOf<"tasks">[];
    expect(group(input({ tasks })).needs.map((u) => u.key)).toEqual(["task-overdue|a"]);
  });

  test("prep-due and sync-late follow their amounts", () => {
    const tuned = settingsFor("user-a", [
      { ...meta("p"), userId: "user-a", rule: "prep-due", amount: 2 },
      { ...meta("s"), userId: "user-a", rule: "sync-late", amount: 2 },
    ] as RowOf<"ruleSettings">[], undefined);
    const i = input({
      settings: tuned,
      events: [ev("in", { start: "2026-11-24T13:00:00.000Z" }), ev("out", { start: "2026-11-24T15:00:00.000Z" })],
      overlays: ["in", "out"].map((e) => ({ ...meta(`o-${e}`), event: e, prep: "needed" }) as RowOf<"overlays">),
      sync: { on: true, last: new Map([["p-a", T(3)]]), heldBack: new Map() },
    });
    expect(group(i).needs.map((u) => u.key).sort()).toEqual(["prep-due|in", "sync-late|p-a"]);
  });
});

