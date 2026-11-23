import { describe, expect, it } from "vitest";
import { parseIcs } from "../parse-ics";
import { syntheticDiaries } from "./synthetic-diaries";

const NOW = new Date("2026-11-23T12:00:00Z");
const window = { timeZone: "Europe/London", windowStart: "2026-10-01T00:00:00.000Z", windowEnd: "2027-02-01T00:00:00.000Z" } as const;

describe("synthetic diaries", () => {
  const files = syntheticDiaries(NOW);

  it("gives a base and an update file for three principals", () => {
    expect(files.map((f) => f.fileName)).toEqual([
      "PRINCIPAL-A.ics", "PRINCIPAL-A-update.ics", "PRINCIPAL-B.ics", "PRINCIPAL-B-update.ics", "PRINCIPAL-C.ics", "PRINCIPAL-C-update.ics",
    ]);
  });

  it("parses with no warnings, with private items masked", () => {
    for (const file of files) {
      const result = parseIcs(file.text, { ...window, privatePolicy: "mask" });
      expect(result.warnings, file.fileName).toEqual([]);
      expect(result.events.length, file.fileName).toBeGreaterThan(30);
      expect(result.maskedPrivate, file.fileName).toBe(8);
    }
  });

  it("is the same for the same date", () => {
    expect(syntheticDiaries(NOW)).toEqual(files);
  });
});
