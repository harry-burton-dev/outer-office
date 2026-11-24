// @vitest-environment node
import { describe, expect, test } from "vitest";
import { isTimeZone, newPrincipalInput, normaliseCode, officeInput, principalChange, sortPrincipals, type PrincipalRow } from "./setup";

const NOW = "2026-11-22T09:00:00.000Z";
const FORM = { name: " Test Office ", timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00", privatePolicy: "mask", automate: "off" };
const ROW: PrincipalRow = { id: "p1", code: "PRINCIPAL-A", title: "Chair", order: 1, active: true };

describe("isTimeZone", () => {
  test.each(["Europe/London", "America/New_York", "UTC", " Asia/Tokyo "])("knows %s", (zone) => expect(isTimeZone(zone)).toBe(true));
  test.each(["", "  ", "Mars/Base", "London"])("refuses %j", (zone) => expect(isTimeZone(zone)).toBe(false));
});

describe("officeInput", () => {
  test("builds the office.save input, trimmed", () => {
    expect(officeInput(FORM, NOW)).toEqual({ ok: true, input: { now: NOW, name: "Test Office", timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00", privatePolicy: "mask", automate: false } });
  });

  test("Power Automate is on only when \"on\" is chosen", () => {
    expect(officeInput({ ...FORM, longRunHours: " 5 ", placeChangeMinutes: "0" }, NOW)).toMatchObject({ ok: true, input: { longRunHours: 5, placeChangeMinutes: 0 } });
    const built = officeInput({ ...FORM, automate: "on" }, NOW);
    expect(built.ok && built.input.automate).toBe(true);
  });

  test("leaves out empty times, so the command keeps what is stored", () => {
    const built = officeInput({ ...FORM, dayStart: " ", dayEnd: "" }, NOW);
    expect(built.ok && built.input).toEqual({ now: NOW, name: "Test Office", timezone: "Europe/London", privatePolicy: "mask", automate: false });
  });

  test("refuses an unknown time zone and an unknown policy", () => {
    expect(officeInput({ ...FORM, timezone: "Mars/Base" }, NOW)).toEqual({ ok: false, error: expect.stringContaining("not a time zone") });
    expect(officeInput({ ...FORM, privatePolicy: "keep" }, NOW)).toEqual({ ok: false, error: expect.stringContaining("masked or dropped") });
    expect(officeInput({ ...FORM, longRunHours: "four" }, NOW)).toEqual({ ok: false, error: expect.stringContaining("number of hours") });
    expect(officeInput({ ...FORM, placeChangeMinutes: "soon" }, NOW)).toEqual({ ok: false, error: expect.stringContaining("number of minutes") });
  });
});

describe("newPrincipalInput", () => {
  test("upper-cases and trims the code", () => {
    expect(normaliseCode("  principal-b ")).toBe("PRINCIPAL-B");
    expect(newPrincipalInput(" principal-b", " Deputy ", NOW)).toEqual({ ok: true, input: { now: NOW, code: "PRINCIPAL-B", title: "Deputy" } });
  });

  test.each(["", "-A", "A B", "A_B", "PRINCIPAL/A", "É"])("refuses the code %j", (code) => {
    expect(newPrincipalInput(code, "Chair", NOW)).toEqual({ ok: false, error: expect.stringContaining("letters, digits and hyphens") });
  });

  test("needs a title", () => {
    expect(newPrincipalInput("A", "  ", NOW)).toEqual({ ok: false, error: "Enter the principal's title." });
  });
});

describe("principalChange", () => {
  test("is null when nothing changed", () => {
    expect(principalChange(ROW, { title: "Chair ", order: "1", active: true }, NOW)).toBeNull();
    expect(principalChange(ROW, { title: "Chair", order: "", active: true }, NOW)).toBeNull();
  });

  test("sends only the fields that changed, never the code", () => {
    expect(principalChange(ROW, { title: "Chair", order: "2.5", active: false }, NOW)).toEqual({ ok: true, input: { now: NOW, id: "p1", order: 2.5, active: false } });
    expect(principalChange(ROW, { title: "President", order: "1", active: true }, NOW)).toEqual({ ok: true, input: { now: NOW, id: "p1", title: "President" } });
  });

  test("refuses an order that is not a number", () => {
    expect(principalChange(ROW, { title: "Chair", order: "first", active: true }, NOW)).toEqual({ ok: false, error: "The order for PRINCIPAL-A must be a number." });
  });
});

test("sortPrincipals: by order, then code, without changing its input", () => {
  const rows = [{ ...ROW, id: "c", code: "C", order: 2 }, { ...ROW, id: "b", code: "B", order: 1 }, { ...ROW, id: "a", code: "A", order: 2 }];
  expect(sortPrincipals(rows).map((r) => r.code)).toEqual(["B", "A", "C"]);
  expect(rows.map((r) => r.code)).toEqual(["C", "B", "A"]);
});
