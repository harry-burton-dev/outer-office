// @vitest-environment node
import { expect, test } from "vitest";
import { peopleFrom } from "./people";
import { personOptions } from "./person-select";

const PEOPLE = peopleFrom([
  { id: "user-a", name: "Alex Example", active: true },
  { id: "user-b", name: "Blair Sample", active: false },
]);

test("offers the empty choice, then active people by name", () => {
  expect(personOptions(PEOPLE, "", "None")).toEqual([
    { value: "", label: "None" },
    { value: "user-a", label: "Alex Example" },
  ]);
});

test("keeps a stored person who is no longer active, so the value still reads", () => {
  expect(personOptions(PEOPLE, "user-b", "None").map((o) => o.label)).toEqual(["None", "Alex Example", "Blair Sample"]);
  expect(personOptions(PEOPLE, "someone-else", "None").at(-1)).toEqual({ value: "someone-else", label: "someone-else" });
});
