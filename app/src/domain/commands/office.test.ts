// @vitest-environment node
import { describe, expect, test } from "vitest";
import { officeSave, principalSave } from "./office";
import { ackPrivacy } from "./people";
import config from "../../../app.config";
import { byId, fails, idOf, NOW, ok, oneDevice, rows, snapshot } from "./testing/world";

describe("office.save", () => {
  test("creates the office record with the given fields", async () => {
    const a = await oneDevice();
    ok(a, officeSave, { now: NOW, name: "Test Office", timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00", privatePolicy: "mask" });
    expect(byId(a, "office", "office")).toMatchObject({ name: "Test Office", timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00", privatePolicy: "mask" });
    expect(rows(a, "log").map((r) => [r.area, r.kind])).toEqual([["setup", "office-created"]]);
  });

  test("changes only the fields it is given", async () => {
    const a = await oneDevice();
    ok(a, officeSave, { now: NOW, name: "Test Office", timezone: "Europe/London" });
    ok(a, officeSave, { now: NOW, privatePolicy: "drop" });
    expect(byId(a, "office", "office")).toMatchObject({ name: "Test Office", privatePolicy: "drop" });
  });

  test("turns Power Automate on and off", async () => {
    const a = await oneDevice();
    ok(a, officeSave, { now: NOW, name: "Test Office", timezone: "Europe/London" });
    expect(byId(a, "office", "office")?.automate).not.toBe(true);
    ok(a, officeSave, { now: NOW, automate: true });
    expect(byId(a, "office", "office")).toMatchObject({ automate: true });
    expect(rows(a, "log").map((r) => r.note)).toContain("Changed: automate");
  });

  test.each([
    [{ now: NOW, name: "Test Office" }, "needs a name and a time zone"],
    [{ now: NOW, name: "Test Office", timezone: "Mars/Base" }, "not a time zone"],
    [{ now: NOW, name: " ", timezone: "Europe/London" }, "can't be empty"],
    [{ now: NOW, name: "Test Office", timezone: "Europe/London", dayStart: "8am" }, "HH:MM"],
    [{ now: NOW, name: "Test Office", timezone: "Europe/London", dayStart: "18:00", dayEnd: "08:00" }, "end after it starts"],
    [{ now: NOW, name: "Test Office", timezone: "Europe/London", privatePolicy: "keep" as "drop" }, "dropped or masked"],
    [{ now: NOW, name: "Test Office", timezone: "Europe/London", automate: "on" as unknown as boolean }, "yes or no"],
    [{ now: "yesterday", name: "Test Office", timezone: "Europe/London" }, "current time"],
  ])("fails on bad input and writes nothing (%#)", async (input, message) => {
    const a = await oneDevice();
    const before = snapshot(a);
    expect(fails(a, officeSave, input)).toContain(message);
    expect(snapshot(a)).toBe(before);
  });
});

test("an office stored before the Power Automate setting reads as off", () => {
  const record = { name: "Test Office", timezone: "Europe/London" };
  expect(config.migrations.office[1](record)).toEqual({ ...record, automate: false });
  expect(config.migrations.office[1]({ ...record, automate: true })).toEqual({ ...record, automate: true });
});

describe("principal.save", () => {
  test("creates a principal with the id built from its code", async () => {
    const a = await oneDevice();
    const id = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
    expect(id).toBe(idOf(a, "principal", "PRINCIPAL-A"));
    expect(byId(a, "principals", id)).toMatchObject({ code: "PRINCIPAL-A", title: "Principal A", order: 1, active: true });
  });

  test("gives each new principal the next order", async () => {
    const a = await oneDevice();
    ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
    const b = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-B", title: "Principal B" });
    expect(byId(a, "principals", b)?.order).toBe(2);
  });

  test("changes the title, order and active flag", async () => {
    const a = await oneDevice();
    const id = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
    ok(a, principalSave, { now: NOW, id, title: "Renamed", order: 5, active: false });
    expect(byId(a, "principals", id)).toMatchObject({ code: "PRINCIPAL-A", title: "Renamed", order: 5, active: false });
  });

  test("refuses a second principal with the same code, and writes nothing", async () => {
    const a = await oneDevice();
    ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
    const before = snapshot(a);
    expect(fails(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Again" })).toContain("already a principal");
    expect(snapshot(a)).toBe(before);
  });

  test("refuses to change a code, a bad code, or a missing principal", async () => {
    const a = await oneDevice();
    const id = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
    expect(fails(a, principalSave, { now: NOW, id, code: "PRINCIPAL-B" })).toContain("can't be changed");
    expect(fails(a, principalSave, { now: NOW, code: "PRINCIPAL A", title: "Spaced" })).toContain("letters, digits and hyphens");
    expect(fails(a, principalSave, { now: NOW, id: "nope", title: "X" })).toContain("no longer exists");
    expect(fails(a, principalSave, { now: NOW, code: "PRINCIPAL-C" })).toContain("can't be empty");
  });
});

describe("people.ackPrivacy", () => {
  test("records the time for the caller under tx.id('person', user)", async () => {
    const a = await oneDevice("user-a");
    expect(ok(a, ackPrivacy, { now: NOW })).toBe(NOW);
    const people = rows(a, "people");
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ userId: "user-a", privacyAckAt: NOW });
  });

  test("records it once: a second run keeps the first time and writes nothing", async () => {
    const a = await oneDevice("user-a");
    ok(a, ackPrivacy, { now: NOW });
    const before = snapshot(a);
    expect(ok(a, ackPrivacy, { now: "2026-11-23T09:00:00.000Z" })).toBe(NOW);
    expect(snapshot(a)).toBe(before);
  });

  test("fails without a time", async () => {
    const a = await oneDevice();
    expect(fails(a, ackPrivacy, { now: "" })).toContain("current time");
  });
});
