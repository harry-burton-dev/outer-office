// Usage figures on the Templates screen (B39), checked against the card-ready
// log rows of a replay through the real commands, plus planted-bug cases.
import { expect, test } from "vitest";
import type { ImportDiff } from "../import/types";
import { cardSet, tabApply, tabRemove, tabTemplateSave, templateSave } from "./commands/cards";
import { importApply } from "./commands/import";
import { principalSave } from "./commands/office";
import { allRows, idOf, NOW, ok, oneDevice, rows } from "./commands/testing/world";
import { tabUsage } from "./tab-usage";

const BASE = { recurrenceId: "", allDay: false, subject: "Board", location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z" };
const at = (day: number) => `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`;
const meeting = (uid: string, day: number) => ({ ...BASE, uid, start: at(day), end: `2026-11-${String(day).padStart(2, "0")}T11:00:00Z` });

test("over a replay, applied, ready before the start and left-empty cards match the log", async () => {
  const a = await oneDevice();
  const principal = ok(a, principalSave, { now: NOW, code: "P", title: "P" });
  const diff: ImportDiff = {
    rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-31T00:00:00Z", changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0,
    added: [meeting("on-time", 10), meeting("late", 11), meeting("never", 12), meeting("future", 28), meeting("removed", 13)],
  };
  ok(a, importApply, { now: at(1), principal, file: "f.ics", diff });
  const id = (uid: string) => idOf(a, "event", principal, uid);
  const who = ok(a, templateSave, { now: at(1), name: "Contact", fields: [{ id: "who", label: "Who", type: "text", required: true }] });
  const brief = ok(a, templateSave, { now: at(1), name: "Brief", fields: [{ id: "doc", label: "Doc", type: "text" }] });
  const board = ok(a, tabTemplateSave, { now: at(1), name: "Board", cards: [who, brief] });
  const tabs = Object.fromEntries(["on-time", "late", "never", "future", "removed"].map((u) => [u, ok(a, tabApply, { now: at(2), event: id(u), tabTemplate: board })]));
  const contactOn = (u: string) => rows(a, "cards").find((c) => c.tab === tabs[u] && c.template === who)!.id;
  ok(a, cardSet, { now: at(9), id: contactOn("on-time"), values: { who: "Sam" } });
  ok(a, cardSet, { now: "2026-11-11T12:00:00.000Z", id: contactOn("late"), values: { who: "Kim" } });
  ok(a, tabRemove, { now: at(3), id: tabs.removed! });

  const usage = tabUsage({ now: at(20), tabs: allRows(a, "tabs"), events: rows(a, "events"), cards: rows(a, "cards"), templates: rows(a, "templates"), log: rows(a, "log") });
  const readyRows = rows(a, "log").filter((l) => l.kind === "card-ready");
  expect(readyRows.map((l) => l.event).sort()).toEqual([id("late"), id("on-time")].sort());
  // "removed" was applied, then removed; "future" hasn't started.
  expect(usage.get(board)).toMatchObject({ applied: 5, started: 3, readyBeforeStart: 1 });
  expect(usage.get(board)?.leftEmpty).toEqual([{ name: "Brief", count: 3 }, { name: "Contact", count: 1 }]);
});

const row = <T>(fields: Record<string, unknown>) => ({ _deleted: false, ...fields }) as T;

test("a tab applied over 90 days ago doesn't count (bug: no window)", () => {
  const usage = tabUsage({ now: "2026-11-20T00:00:00Z", tabs: [row({ id: "t", event: "e", tabTemplate: "tt", appliedAt: "2026-08-01T00:00:00Z" })], events: [], cards: [], templates: [], log: [] });
  expect(usage.has("tt")).toBe(false);
});

test("a removed tab counts as applied but not as started (bug: dropping removed tabs, or judging them)", () => {
  const tabs = [row({ id: "t", event: "e", tabTemplate: "tt", appliedAt: "2026-11-01T00:00:00Z", _deleted: true })] as never[];
  const events = [row({ id: "e", start: "2026-11-05T00:00:00Z" })] as never[];
  expect(tabUsage({ now: "2026-11-20T00:00:00Z", tabs, events, cards: [], templates: [], log: [] }).get("tt")).toMatchObject({ applied: 1, started: 0 });
});

test("a ready tab finished after the start is not ready before it (bug: ignoring the log)", () => {
  const tabs = [row({ id: "t", event: "e", tabTemplate: "tt", appliedAt: "2026-11-01T00:00:00Z" })] as never[];
  const events = [row({ id: "e", start: "2026-11-05T10:00:00Z" })] as never[];
  const log = [row({ id: "l", kind: "card-ready", event: "e", at: "2026-11-05T11:00:00Z" })] as never[];
  expect(tabUsage({ now: "2026-11-20T00:00:00Z", tabs, events, cards: [], templates: [], log }).get("tt")?.readyBeforeStart).toBe(0);
});
