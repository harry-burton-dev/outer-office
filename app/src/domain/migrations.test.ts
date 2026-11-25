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

test("an event stored before v3 gets its attendee list, series identity and empty Outlook fields", () => {
  const v2 = {
    uid: "u1", recurrenceId: "2026-11-02T10:00:00.000Z",
    requiredAttendees: "Alex Example <alex@example.invalid> · accepted\nsam@example.invalid", optionalAttendees: "Jo · tentative",
  };
  const v3 = config.migrations.events[2](v2);
  expect(v3).toMatchObject({ seriesId: "u1", kind: "occurrence", source: "", outlookId: "", body: "", raw: "", online: false });
  expect(JSON.parse(String(v3.attendees))).toEqual([
    { name: "Alex Example", address: "alex@example.invalid", type: "required", response: "accepted", respondedAt: "" },
    { name: "", address: "sam@example.invalid", type: "required", response: "", respondedAt: "" },
    { name: "Jo", address: "", type: "optional", response: "tentative", respondedAt: "" },
  ]);
  expect(config.migrations.events[2]({ uid: "csv:x", recurrenceId: "" })).toMatchObject({ seriesId: "", kind: "single", source: "csv" });
});

test("a proposal stored before groups reads ungrouped and not superseded", () => {
  expect(config.migrations.proposals[2]({ event: "e1", kind: "move" })).toEqual({ event: "e1", kind: "move", group: "", superseded: "" });
});
