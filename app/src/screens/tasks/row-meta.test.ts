import { expect, test } from "vitest";
import type { RowOf } from "@trellis/framework";
import { neighboursAfterMove } from "./neighbours";
import { MAX_META_ITEMS, rowMeta } from "./row-meta";

const task = (fields: Partial<RowOf<"tasks">>) => ({ id: "t1", _deleted: false, ...fields }) as RowOf<"tasks">;
const context = { today: "2026-11-22", viewerId: "user-a", principalCodes: new Map([["p-a", "PRINCIPAL-A"]]) };

test("row metadata is date, assignee, principal, never more than three", () => {
  const meta = rowMeta(task({ due: "2026-11-20", deadline: "2026-11-30", assignee: "user-b", principal: "p-a" }), context);
  expect(meta).toEqual([
    { kind: "date", date: "2026-11-20", deadline: false, overdue: true },
    { kind: "assignee", userId: "user-b" },
    { kind: "principal", code: "PRINCIPAL-A" },
  ]);
  expect(meta.length).toBeLessThanOrEqual(MAX_META_ITEMS);
});

test("the viewer's own name and unknown principals are left out; a deadline stands in for a missing due date", () => {
  expect(rowMeta(task({ deadline: "2026-11-30", assignee: "user-a", principal: "p-gone" }), context)).toEqual([
    { kind: "date", date: "2026-11-30", deadline: true, overdue: false },
  ]);
});

test("moving one place gives the new neighbours, and nothing past the ends", () => {
  const ids = ["a", "b", "c", "d"];
  expect(neighboursAfterMove(ids, 0, "down")).toEqual({ previous: "b", next: "c" });
  expect(neighboursAfterMove(ids, 2, "down")).toEqual({ previous: "d", next: undefined });
  expect(neighboursAfterMove(ids, 1, "up")).toEqual({ previous: undefined, next: "a" });
  expect(neighboursAfterMove(ids, 0, "up")).toBeUndefined();
  expect(neighboursAfterMove(ids, 3, "down")).toBeUndefined();
});
