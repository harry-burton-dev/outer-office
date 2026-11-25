// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { RowOf } from "@trellis/framework";
import { coverage } from "./coverage";
import { RULES, settingsFor } from "./rules";

const meta = (id: string) => ({ id, _deleted: false, _conflicts: {} });
const NOW = "2026-11-24T12:00:00.000Z";
const off = (user: string) => RULES.filter((r) => r.lane === "needs").map((r) => ({ ...meta(`${user}-${r.id}`), userId: user, rule: r.id, on: false }) as RowOf<"ruleSettings">);

describe("coverage", () => {
  test("warns for a principal nobody is watching (B30): needs-you rules off, own rules elsewhere, cover not in force", () => {
    const settings = [...off("user-a"), ...off("user-b")];
    const rules = [{ ...meta("r"), owner: "user-a", condition: "prep-due", params: JSON.stringify({ principal: "p-a" }), lane: "needs", on: true }] as RowOf<"rules">[];
    const cover = [
      { ...meta("c1"), principal: "p-b", absent: "user-a", cover: "user-b", start: "2026-11-25T00:00:00.000Z", end: "2026-11-26T00:00:00.000Z" },
      { ...meta("c2"), principal: "p-a", absent: "user-a", cover: "user-b", start: "2026-11-24T00:00:00.000Z", end: "2026-11-25T00:00:00.000Z" },
    ] as RowOf<"cover">[];
    const result = coverage({
      principals: [{ id: "p-a" }, { id: "p-b" }], users: ["user-a", "user-b"],
      settingsOf: (u) => settingsFor(u, settings, undefined), rules, cover, now: NOW,
    });
    expect(result.get("p-a")).toEqual([{ user: "user-a" }, { user: "user-b", coveringFor: "user-a" }]);
    expect(result.get("p-b")).toEqual([]);
  });

  test("with the defaults everyone watches every principal", () => {
    const result = coverage({ principals: [{ id: "p-a" }], users: ["user-a"], settingsOf: (u) => settingsFor(u, [], undefined), rules: [], cover: [], now: NOW });
    expect(result.get("p-a")).toEqual([{ user: "user-a" }]);
  });
});
