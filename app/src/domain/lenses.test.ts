import { describe, expect, test } from "vitest";
import { lensById, lensFill } from "./lenses";
import type { Event } from "./selectors";

const NOW = new Date("2026-11-23T12:00:00Z");
const event = (fields: Partial<Event>): Event => ({ id: "e", _conflicts: {}, ...fields }) as Event;
const read = (id: string, fields: Partial<Event>, prep?: string) =>
  lensById(id)!.read(event(fields), prep === undefined ? undefined : ({ prep } as never), NOW, []);

describe("lenses", () => {
  test("completeness counts the filled parts", () => {
    expect(read("completeness", {}).strength).toBe(0.2);
    expect(read("completeness", { location: "Room 1", organizer: "A", requiredAttendees: "B", categories: "Board" }).strength).toBe(1);
    expect(read("completeness", { location: "Room 1", organizer: "A", requiredAttendees: "B", categories: "Board" }, "needed").strength).toBe(0.8);
  });

  test("priority ranks by the office's priority, p1 strongest and none set faintest", () => {
    const strength = (priority?: number) => lensById("priority")!.read(event({}), priority === undefined ? undefined : ({ priority } as never), NOW, []).strength;
    expect([1, 2, 3, 4].map(strength)).toEqual([1, 0.7, 0.4, 0.05]);
    expect(strength()).toBe(0.05);
    expect(lensById("seniority")).toBeUndefined();
  });

  test("freshness fades over thirty days", () => {
    expect(read("freshness", { sourceModified: "2026-11-23T12:00:00Z" }).strength).toBe(1);
    expect(read("freshness", { sourceModified: "2026-11-08T12:00:00Z" }).strength).toBeCloseTo(0.5);
    expect(read("freshness", { sourceModified: "2026-09-01T00:00:00Z" }).strength).toBe(0);
    expect(read("freshness", {}).strength).toBe(0);
  });

  test("location shows the place and tells in person from online", () => {
    expect(read("location", { location: "Board room" })).toEqual({ strength: 1, text: "Board room" });
    expect(read("location", { location: "Microsoft Teams Meeting" }).strength).toBe(0.5);
    expect(read("location", {}).text).toBe("No location");
  });

  test("the fill runs from clear to nearly solid", () => {
    expect(lensFill(0)).toBe("rgba(129, 140, 248, 0.00)");
    expect(lensFill(1)).toBe("rgba(129, 140, 248, 0.90)");
  });
});
