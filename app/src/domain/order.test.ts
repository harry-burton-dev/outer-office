// @vitest-environment node
import { describe, expect, test } from "vitest";
import { between } from "./order";

describe("between", () => {
  test("gives a starting order when the list is empty", () => {
    expect(between(undefined, undefined)).toBe(1);
  });

  test("goes after the last item", () => {
    expect(between(3, undefined)).toBeGreaterThan(3);
  });

  test("goes before the first item", () => {
    expect(between(undefined, 3)).toBeLessThan(3);
  });

  test("goes strictly between two neighbours", () => {
    const order = between(1, 2);
    expect(order).toBeGreaterThan(1);
    expect(order).toBeLessThan(2);
  });

  test("many inserts at the same spot stay in order", () => {
    // Arrange: always insert directly after item 1, before the previous insert.
    let next = 2;
    const inserted: number[] = [];
    // Act
    for (let i = 0; i < 40; i += 1) {
      next = between(1, next);
      inserted.push(next);
    }
    // Assert: each insert sits above 1 and below the one before it.
    expect(inserted.every((value) => value > 1)).toBe(true);
    expect(inserted.every((value, i) => i === 0 || value < inserted[i - 1])).toBe(true);
  });

  test("many inserts at the end keep rising", () => {
    let last: number | undefined;
    const orders: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      last = between(last, undefined);
      orders.push(last);
    }
    expect(orders.every((value, i) => i === 0 || value > orders[i - 1])).toBe(true);
  });

  test("neighbours that are tied or out of order give the first one's order", () => {
    expect(between(2, 2)).toBe(2);
    expect(between(3, 2)).toBe(3);
  });
});
