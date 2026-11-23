// @vitest-environment node
import { expect, test } from "vitest";
import { activePeople, peopleFrom } from "./people";

const LIST = [
  { id: "user-a", name: "Alex Example", active: true },
  { id: "user-b", name: "Blair Sample", active: false },
];

test("nameOf shows a known user's name", () => {
  expect(peopleFrom(LIST).nameOf("user-a")).toBe("Alex Example");
  expect(peopleFrom(LIST).nameOf("user-b")).toBe("Blair Sample");
});

test("nameOf falls back to the id when the user is unknown, and shows admin as Admin", () => {
  expect(peopleFrom(LIST).nameOf("user-z")).toBe("user-z");
  expect(peopleFrom([]).nameOf("admin")).toBe("Admin");
});

test("a users-table record for admin wins over the fallback", () => {
  expect(peopleFrom([{ id: "admin", name: "Office Admin", active: true }]).nameOf("admin")).toBe("Office Admin");
});

test("activePeople leaves out inactive users", () => {
  expect(activePeople(peopleFrom(LIST)).map((u) => u.id)).toEqual(["user-a"]);
});
