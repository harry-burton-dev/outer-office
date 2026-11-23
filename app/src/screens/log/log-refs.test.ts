// @vitest-environment node
import { describe, expect, test } from "vitest";
import { logValueText, NOT_SYNCED, type LogLookups } from "./log-refs";

const ZONE = "Europe/London";
const lookups: LogLookups = {
  sectionName: (id) => (id === "section-1" ? "Speeches" : undefined),
  eventSubject: (id) => (id === "event-1" ? "Budget meeting" : undefined),
  userName: (id) => (id === "user-b" ? "Blair Sample" : undefined),
};
const task = (kind: string) => ({ area: "task", kind });

describe("logValueText", () => {
  test("shows a task move's section by name", () => {
    expect(logValueText(task("moved"), "section-1", lookups, ZONE)).toBe("Speeches");
  });

  test("leaves a reorder's numbers as they are", () => {
    expect(logValueText(task("moved"), "2.5", lookups, ZONE)).toBe("2.5");
  });

  test("shows a linked or unlinked event by its subject", () => {
    expect(logValueText(task("linked"), "event-1", lookups, ZONE)).toBe("Budget meeting");
    expect(logValueText(task("unlinked"), "event-1", lookups, ZONE)).toBe("Budget meeting");
  });

  test("shows an assignment's user by name", () => {
    for (const kind of ["assigned", "accepted", "declined", "recalled"]) expect(logValueText(task(kind), "user-b", lookups, ZONE)).toBe("Blair Sample");
  });

  test("says not synced yet for a record that has not arrived", () => {
    expect(logValueText(task("moved"), "section-9", lookups, ZONE)).toBe(NOT_SYNCED);
    expect(logValueText(task("linked"), "event-9", lookups, ZONE)).toBe(NOT_SYNCED);
    expect(logValueText(task("assigned"), "user-z", lookups, ZONE)).toBe(NOT_SYNCED);
  });

  test("an empty value stays empty", () => {
    expect(logValueText(task("moved"), "", lookups, ZONE)).toBe("");
    expect(logValueText(task("assigned"), undefined, lookups, ZONE)).toBe("");
  });

  test("other rows format their values as before", () => {
    expect(logValueText({ area: "calendar", kind: "moved" }, "2026-11-24T14:00:00.000Z", lookups, ZONE)).toBe("Tue 24 Nov 14:00");
    expect(logValueText({ area: "overlay", kind: "flag" }, "true", lookups, ZONE)).toBe("yes");
    expect(logValueText(task("edited"), "section-1", lookups, ZONE)).toBe("section-1");
  });
});
