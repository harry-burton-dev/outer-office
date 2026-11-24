// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { RowOf } from "@trellis/framework";
import { DIARY_SYNC_FLOW, FLOWS, principalHealth, type HealthInput } from "./flows";
import type { InboxEntry } from "./diary-inbox";

const NOW = "2026-11-24T12:00:00.000Z";
const run = (over: Partial<RowOf<"flowRuns">> = {}) => ({
  id: "r1", flow: "diary-sync", principal: "PRINCIPAL-A", file: "20261124T113000Z.json", fileAt: "2026-11-24T11:30:00.000Z",
  readAt: "2026-11-24T11:31:00.000Z", readBy: "user-a", outcome: "applied", reason: "", added: 1, changed: 0, gone: 0, events: 20, ...over,
}) as unknown as RowOf<"flowRuns">;
const arrived = (name = "20261124T120000Z.json"): InboxEntry =>
  ({ ok: true, update: { principal: "PRINCIPAL-A", path: `inbox/diary-sync/PRINCIPAL-A/${name}`, olderPaths: [], generatedAt: "2026-11-24T12:00:00.000Z", payload: {} } }) as unknown as InboxEntry;
const health = (over: Partial<HealthInput>) =>
  principalHealth({ flow: DIARY_SYNC_FLOW, on: true, code: "PRINCIPAL-A", run: undefined, entry: null, now: NOW, canApply: true, ...over });

describe("a principal's diary sync health", () => {
  test("off when the office's setting is off, even with a run on record", () => {
    expect(health({ on: false, run: run() })).toMatchObject({ state: "off", lastRunAt: "2026-11-24T11:30:00.000Z" });
  });

  test("no file yet when nothing was ever read", () => {
    expect(health({}).state).toBe("never");
  });

  test("on time within the late limit, late past it, and an unchanged run counts as a run", () => {
    expect(health({ run: run() }).state).toBe("ok");
    expect(health({ run: run({ outcome: "unchanged", fileAt: "2026-11-24T10:31:00.000Z" }) }).state).toBe("ok");
    expect(health({ run: run({ fileAt: "2026-11-24T10:29:00.000Z" }) }).state).toBe("late");
  });

  test("a file the scan can't read is refused with its reason", () => {
    const entry: InboxEntry = { ok: false, principal: "PRINCIPAL-A", path: "x.json", reason: "it holds an error from Outlook" };
    expect(health({ entry, run: run() })).toMatchObject({ state: "refused", reason: "it holds an error from Outlook" });
  });

  test("a run the app refused stays refused until a good file replaces it", () => {
    expect(health({ run: run({ outcome: "refused", reason: "held back" }) })).toMatchObject({ state: "refused", reason: "held back" });
  });

  test("a new file is applying for an importer and waiting for a viewer", () => {
    expect(health({ entry: arrived() })).toMatchObject({ state: "arrived", lastRunAt: "2026-11-24T12:00:00.000Z" });
    expect(health({ entry: arrived(), canApply: false }).state).toBe("waiting");
  });

  test("a viewer sees an importer's refusal of the file still in the folder", () => {
    const entry = arrived("20261124T113000Z.json");
    expect(health({ entry, canApply: false, run: run({ outcome: "refused", reason: "held back" }) })).toMatchObject({ state: "refused", reason: "held back" });
  });

  test("every flow has a guide and a folder per principal", () => {
    for (const flow of FLOWS) {
      expect(flow.guide).toMatch(/^# /);
      expect(flow.folderOf("PRINCIPAL-A")).toBe("automate/inbox/diary-sync/PRINCIPAL-A");
    }
  });
});
