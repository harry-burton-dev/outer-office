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
