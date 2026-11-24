// @vitest-environment node
// Records stored by an older version read correctly after upgrading.
import { expect, test } from "vitest";
import config from "../../app.config";

const overlays = config.migrations.overlays;
const upgrade = (record: Record<string, unknown>) => overlays[3](overlays[2](overlays[1](record)));

test("an overlay archived before reasons existed reads as archived for an unknown reason", () => {
  expect(overlays[3]({ event: "e1", archived: "2026-11-20T09:00:00Z" })).toMatchObject({ archiveReason: "unknown" });
  expect(upgrade({ event: "e1" })).toMatchObject({ tags: "", archived: "", archiveReason: "" });
  expect(overlays[3]({ event: "e1", archived: "x", archiveReason: "cancelled" })).toMatchObject({ archiveReason: "cancelled" });
});

test("a person stored before watch rules reads with the default rules", () => {
  expect(config.migrations.people[1]({ name: "A" })).toEqual({ name: "A", watchOff: "" });
});

test("an overlay stored before quiet, links and priority reads loud, unlinked and at p4", () => {
  expect(overlays[4]({ event: "e1", flagged: true })).toEqual({ event: "e1", flagged: true, quiet: false, parent: "", priority: 4 });
  expect(overlays[4]({ event: "e1", quiet: true, parent: "e2", priority: 1 })).toMatchObject({ quiet: true, parent: "e2", priority: 1 });
});

test("an office stored before the day summary reads with a 4-hour run and 30-minute place changes", () => {
  expect(config.migrations.office[2]({ name: "O" })).toEqual({ name: "O", longRunHours: 4, placeChangeMinutes: 30 });
  expect(config.migrations.office[2]({ longRunHours: 6, placeChangeMinutes: 0 })).toEqual({ longRunHours: 6, placeChangeMinutes: 0 });
});

test("a card stored before tabs reads as on no tab, using its template's fields", () => {
  expect(config.migrations.cards[1]({ event: "e1", template: "t1" })).toEqual({ event: "e1", template: "t1", tab: "", fields: "" });
});

test("a task stored before tabs reads as made by no tab", () => {
  expect(config.migrations.tasks[2]({ title: "T" })).toEqual({ title: "T", tab: "", offsetDays: 0 });
});
