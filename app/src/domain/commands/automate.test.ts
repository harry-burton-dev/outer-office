// @vitest-environment node
import { describe, expect, test } from "vitest";
import { automateRecordRun, type FlowRunInput } from "./automate";
import { fails, NOW, ok, oneDevice, rows } from "./testing/world";

const input = (over: Partial<FlowRunInput> = {}): FlowRunInput => ({
  now: NOW, flow: "diary-sync", principal: "PRINCIPAL-A", file: "20261122T083000Z.json", fileAt: "2026-11-22T08:30:00Z",
  outcome: "applied", added: 2, changed: 1, gone: 0, events: 12, ...over,
});

describe("automate.recordRun", () => {
  test("keeps one record per flow and principal, overwritten by a newer file", async () => {
    const device = await oneDevice();
    ok(device, automateRecordRun, input());
    ok(device, automateRecordRun, input({ file: "20261122T090000Z.json", fileAt: "2026-11-22T09:00:00Z", outcome: "unchanged" }));
    ok(device, automateRecordRun, input({ principal: "PRINCIPAL-B" }));
    const runs = rows(device, "flowRuns");
    expect(runs).toHaveLength(2);
    expect(runs.find((r) => r.principal === "PRINCIPAL-A")).toMatchObject({ outcome: "unchanged", fileAt: "2026-11-22T09:00:00Z", readAt: NOW, readBy: "user-a" });
  });

  test("an older file never replaces a newer one, and the same file twice changes nothing", async () => {
    const device = await oneDevice();
    ok(device, automateRecordRun, input({ file: "20261122T090000Z.json", fileAt: "2026-11-22T09:00:00Z" }));
    ok(device, automateRecordRun, input({ now: "2026-11-22T09:05:00.000Z", file: "20261122T090000Z.json", fileAt: "2026-11-22T09:00:00Z" }));
    ok(device, automateRecordRun, input());
    expect(rows(device, "flowRuns")[0]).toMatchObject({ fileAt: "2026-11-22T09:00:00Z", readAt: NOW });
  });

  test("keeps the reason only for a refused file, and takes a name that isn't a time", async () => {
    const device = await oneDevice();
    ok(device, automateRecordRun, input({ reason: "ignored" }));
    expect(rows(device, "flowRuns")[0]?.reason).toBe("");
    ok(device, automateRecordRun, input({ file: "notes.json", fileAt: "", outcome: "refused", reason: "the name isn't a time" }));
    expect(rows(device, "flowRuns")[0]).toMatchObject({ outcome: "refused", reason: "the name isn't a time" });
  });

  test("refuses a bad outcome, a bad time and an empty code", async () => {
    const device = await oneDevice();
    expect(fails(device, automateRecordRun, input({ outcome: "maybe" as FlowRunInput["outcome"] }))).toContain("outcome");
    expect(fails(device, automateRecordRun, input({ fileAt: "yesterday" }))).toContain("ISO");
    expect(fails(device, automateRecordRun, input({ principal: " " }))).toContain("can't be empty");
  });
});
