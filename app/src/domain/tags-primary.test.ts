// The primary tag: the first own tag leads and gives the colour.
import { describe, expect, test } from "vitest";
import { eventTags, makePrimary, taskTags, type Tag } from "./tags";

const tag = (id: string, name: string, order: number): Tag => ({ id, name, colour: "#f87171", order, _conflicts: {} }) as Tag;
const TAGS = [tag("a", "Board", 1), tag("b", "Urgent", 2), tag("c", "Travel", 3)];

describe("primary tag", () => {
  test("the first own tag leads, the rest keep tag order", () => {
    expect(taskTags("c,a,b", TAGS).map((t) => t.id)).toEqual(["c", "a", "b"]);
    expect(eventTags("Board", "b", TAGS).map((t) => t.id)).toEqual(["b", "a"]);
  });

  test("with only category tags, tag order decides", () => {
    expect(eventTags("Travel,Board", "", TAGS).map((t) => t.id)).toEqual(["a", "c"]);
  });

  test("makePrimary moves a tag to the front, adding a category tag to the own tags", () => {
    expect(makePrimary("a,b", "b")).toEqual(["b", "a"]);
    expect(makePrimary("b", "a")).toEqual(["a", "b"]);
    expect(eventTags("Board", makePrimary("b", "a").join(","), TAGS)[0]?.id).toBe("a");
  });
});
