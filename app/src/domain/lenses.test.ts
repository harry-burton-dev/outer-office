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

  test("seniority follows the office's tag order", () => {
    const tags = [{ id: "t1", name: "Board", order: 0 }, { id: "t2", name: "Internal", order: 1 }, { id: "t3", name: "Admin", order: 2 }] as never[];
    const senior = (categories: string) => lensById("seniority")!.read(event({ categories }), undefined, NOW, tags).strength;
    expect(senior("Board")).toBe(1);
    expect(senior("Internal, Board")).toBe(1);
    expect(senior("Admin")).toBeCloseTo(0.15);
    expect(senior("")).toBe(0.05);
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
