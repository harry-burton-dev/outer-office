// @vitest-environment node
import { describe, expect, test } from "vitest";
import { settingsFor } from "../rules";
import { updatesFor } from "../updates";
import { ruleSettingSet, updateSet } from "./alerts";
import { principalSave } from "./office";
import { byId, fails, idOf, makeTestWorld, NOW, ok, oneDevice, rows } from "./testing/world";

const LATER = "2026-11-22T10:00:00.000Z";

describe("ruleSetting.set", () => {
  test("switches, tunes and sets surfaces for the caller only", async () => {
    const a = await oneDevice("user-a");
    ok(a, ruleSettingSet, { now: NOW, rule: "prep-due", amount: 6 });
    ok(a, ruleSettingSet, { now: NOW, rule: "prep-due", on: false, surfaces: ["badge", "home"] });
    expect(byId(a, "ruleSettings", idOf(a, "ruleSetting", "user-a", "prep-due"))).toMatchObject({
      userId: "user-a", rule: "prep-due", on: false, amount: 6, surfaces: "home,badge",
    });
    expect(settingsFor("user-a", rows(a, "ruleSettings"), undefined).get("prep-due")).toEqual({ on: false, amount: 6, surfaces: ["home", "badge"] });
    expect(settingsFor("user-b", rows(a, "ruleSettings"), undefined).get("prep-due")?.on).toBe(true);
  });

  test("refuses an unknown rule, an amount on a rule without one, and an amount out of range", async () => {
    const a = await oneDevice("user-a");
    expect(fails(a, ruleSettingSet, { now: NOW, rule: "nope" })).toBe("That is not a rule.");
    expect(fails(a, ruleSettingSet, { now: NOW, rule: "added", amount: 3 })).toBe("That rule has no amount.");
    expect(fails(a, ruleSettingSet, { now: NOW, rule: "prep-due", amount: 0 })).toMatch(/from 1 to 336/);
    expect(fails(a, ruleSettingSet, { now: NOW, rule: "prep-due", amount: 1.5 })).toMatch(/whole number/);
    expect(fails(a, ruleSettingSet, { now: NOW, rule: "added", surfaces: ["email" as never] })).toMatch(/Surfaces/);
  });
});

describe("update.set", () => {
  test("a needs-you update can be snoozed but not dismissed, pinned or seen (B26)", async () => {
    const a = await oneDevice("user-a");
    for (const state of ["dismissed", "pinned", "seen"] as const) {
      expect(fails(a, updateSet, { now: NOW, key: "task-overdue|t1", state })).toMatch(/can only be snoozed/);
    }
    ok(a, updateSet, { now: NOW, key: "task-overdue|t1", state: "snoozed", until: LATER });
    expect(byId(a, "updateState", idOf(a, "update", "user-a", "task-overdue|t1"))).toMatchObject({ state: "snoozed", until: LATER, at: NOW });
  });

  test("a for-information update can be seen, dismissed, snoozed, pinned and cleared", async () => {
    const a = await oneDevice("user-a");
    for (const state of ["seen", "dismissed", "pinned", "clear"] as const) ok(a, updateSet, { now: NOW, key: "e:e1", state });
    expect(byId(a, "updateState", idOf(a, "update", "user-a", "e:e1"))?.state).toBe("");
    expect(fails(a, updateSet, { now: NOW, key: "e:e1", state: "snoozed", until: NOW })).toBe("Snooze until a time after now.");
    expect(fails(a, updateSet, { now: NOW, key: "e:e1", state: "gone" as never })).toMatch(/seen, dismissed/);
  });

  test("in the two-user test, one user's dismissal shows as dealt with on the other's update (B27)", async () => {
    const world = await makeTestWorld();
    const a = await world.device("user-a");
    const b = await world.device("user-b");
    const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
    await world.sync([a, b]);
    ok(b, updateSet, { now: LATER, key: "e:e1", state: "dismissed" });
    await world.sync([a, b]);
    const log = [{ id: "l1", _deleted: false, _conflicts: {}, at: NOW, by: "user-c", principal, area: "calendar", kind: "added", event: "e1", task: "", from: "", to: "", note: "" }];
    const groups = updatesFor({
      user: "user-a", now: LATER, timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00", principals: [{ id: principal }],
      log: log as never, tasks: [], events: [], overlays: [], seen: [], updateState: rows(a, "updateState"),
      settings: settingsFor("user-a", [], undefined), sync: new Map(), readiness: new Map(),
    });
    expect(groups[0].info[0].dealtWith).toEqual({ by: "user-b", at: LATER });
  });
});
