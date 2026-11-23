// @vitest-environment node
import { expect, test } from "vitest";
import type { ImportDiff } from "@/import/types";
import { countsLine, importWindow } from "./import-model";

const DIFF: ImportDiff = {
  rangeStart: "2026-11-01T00:00:00.000Z", rangeEnd: "2026-11-30T00:00:00.000Z", added: [], changed: [], gone: [], returned: [],
  unchanged: 4, skippedOlder: 1, droppedPrivate: 2, maskedPrivate: 0,
};

test("the window runs from 6 months before now to 12 months after", () => {
  expect(importWindow("2026-11-22T09:00:00.000Z")).toEqual({ windowStart: "2026-05-22T09:00:00.000Z", windowEnd: "2027-11-22T09:00:00.000Z" });
});

test("the counts line names dropped private items under the drop policy", () => {
  expect(countsLine(DIFF, "drop")).toBe("0 added, 0 moved, 0 changed, 0 gone, 0 returned, 4 unchanged, 1 skipped as older, 2 private dropped");
});
