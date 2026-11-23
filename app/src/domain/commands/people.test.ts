// @vitest-environment node
import { describe, expect, test } from "vitest";
import { ackPrivacy, setMode } from "./people";
import { byId, fails, idOf, NOW, ok, oneDevice, rows, snapshot } from "./testing/world";

describe("people.setMode", () => {
  test("sets the user's mode under tx.id('person', userId) and logs it once as setup", async () => {
    const a = await oneDevice("admin");
    ok(a, setMode, { now: NOW, userId: "user-b", mode: "viewer" });
    expect(byId(a, "people", idOf(a, "person", "user-b"))).toMatchObject({ userId: "user-b", mode: "viewer" });
    expect(rows(a, "log").map((r) => [r.area, r.kind, r.from, r.to, r.by])).toEqual([["setup", "mode-changed", "assistant", "viewer", "admin"]]);
  });

  test("keeps the user's privacy acknowledgement", async () => {
    const a = await oneDevice("user-a");
    ok(a, ackPrivacy, { now: NOW });
    ok(a, setMode, { now: NOW, userId: "user-a", mode: "viewer" });
    expect(byId(a, "people", idOf(a, "person", "user-a"))).toMatchObject({ userId: "user-a", mode: "viewer", privacyAckAt: NOW });
  });

  test("writes nothing when the mode is already that one", async () => {
    const a = await oneDevice("admin");
    ok(a, setMode, { now: NOW, userId: "user-b", mode: "viewer" });
    const before = snapshot(a);
    ok(a, setMode, { now: NOW, userId: "user-b", mode: "viewer" });
    expect(snapshot(a)).toBe(before);
  });

  test("a user with no record is an assistant, so setting assistant writes nothing", async () => {
    const a = await oneDevice("admin");
    const before = snapshot(a);
    ok(a, setMode, { now: NOW, userId: "user-b", mode: "assistant" });
    expect(snapshot(a)).toBe(before);
  });

  test("switches back to assistant", async () => {
    const a = await oneDevice("admin");
    ok(a, setMode, { now: NOW, userId: "user-b", mode: "viewer" });
    ok(a, setMode, { now: NOW, userId: "user-b", mode: "assistant" });
    expect(byId(a, "people", idOf(a, "person", "user-b"))?.mode).toBe("assistant");
    expect(rows(a, "log")).toHaveLength(2);
  });

  test.each([
    [{ now: NOW, userId: "", mode: "viewer" as const }, "can't be empty"],
    [{ now: NOW, userId: "user-b", mode: "owner" as "viewer" }, "assistant or viewer"],
    [{ now: "today", userId: "user-b", mode: "viewer" as const }, "current time"],
  ])("fails on bad input and writes nothing (%#)", async (input, message) => {
    const a = await oneDevice("admin");
    const before = snapshot(a);
    expect(fails(a, setMode, input)).toContain(message);
    expect(snapshot(a)).toBe(before);
  });
});
