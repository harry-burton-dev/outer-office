// @vitest-environment node
import { expect, test } from "vitest";
import type { RowOf } from "@trellis/framework";
import { principalOptions } from "./field-options";

type Principal = RowOf<"principals">;
const principal = (id: string, code: string, active: boolean): Principal => ({ id, _deleted: false, code, active }) as Principal;
const A = principal("p-a", "PRINCIPAL-A", true);
const B = principal("p-b", "PRINCIPAL-B", false);

test("offers None and the active principals", () => {
  expect(principalOptions([A], [A, B], undefined).map((o) => o.label)).toEqual(["None", "PRINCIPAL-A"]);
});

test("keeps the task's own tag when that principal is no longer active", () => {
  expect(principalOptions([A], [A, B], "p-b").map((o) => o.label)).toEqual(["None", "PRINCIPAL-A", "PRINCIPAL-B"]);
});

test("shows just None when there is no active principal to offer", () => {
  expect(principalOptions([], [B], "p-b")).toEqual([{ value: "", label: "None" }]);
  expect(principalOptions([], [B], undefined)).toEqual([{ value: "", label: "None" }]);
});
