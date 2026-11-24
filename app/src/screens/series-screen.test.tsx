// The Series screen: one row per series in the chosen principal's diary, opening to its occurrences.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { importApply } from "@/domain/commands";
import { diffImport } from "@/import/diff";
import { parseIcs } from "@/import/parse-ics";
import { syntheticDiaries } from "@/import/testing/synthetic-diaries";
import { AppProbe, cleanupApp, NOW, probe, renderApp } from "@/app/testing/render-app";
import { SeriesScreen } from "./series-screen";

afterEach(cleanupApp);

const WINDOW = { timeZone: "Europe/London", windowStart: "2026-10-01T00:00:00.000Z", windowEnd: "2027-02-01T00:00:00.000Z", privatePolicy: "mask" } as const;

test("the series and exceptions shown match the synthetic diary's", async () => {
  const file = syntheticDiaries(new Date(NOW)).find((f) => f.fileName === "PRINCIPAL-A.ics")!;
  const series = (file.text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? []).filter((v) => /^RRULE:/m.test(v));
  const exceptions = (file.text.match(/^RECURRENCE-ID/gm) ?? []).length;
  await renderApp({
    seed: (s) => {
      const principal = s.principal("PRINCIPAL-A");
      s.run(importApply, { now: NOW, principal, file: file.fileName, diff: diffImport([], parseIcs(file.text, WINDOW)) });
    },
    children: <><SeriesScreen /><AppProbe /></>,
  });
  const rows = screen.getAllByRole("button", { expanded: false });
  expect(rows).toHaveLength(series.length);
  const counted = rows.map((b) => within(b.closest("tr")!).getAllByRole("cell").map((c) => c.textContent));
  expect(counted.reduce((sum, cells) => sum + Number(cells[4]), 0)).toBe(exceptions);
  expect(counted.map((cells) => cells[1])).toEqual(series.map(() => "Repeats"));

  fireEvent.click(screen.getByRole("button", { name: "Executive team" }));
  const list = screen.getByRole("list", { name: "Occurrences of Executive team" });
  const items = within(list).getAllByRole("button");
  expect(items).toHaveLength(8);
  fireEvent.click(items[0]!);
  expect(JSON.parse(probe().panel)).toMatchObject({ kind: "engagement" });
});

test("a principal with no recurring meetings sees an empty state", async () => {
  await renderApp({ seed: (s) => s.principal("PRINCIPAL-A"), children: <SeriesScreen /> });
  expect(screen.getByText("No recurring meetings")).toBeTruthy();
});
