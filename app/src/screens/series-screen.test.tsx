// The Series screen: one row per series in the chosen principal's diary, opening to its occurrences.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { importApply } from "@/domain/commands";
import { diffImport } from "@/import/diff";
import { parseIcs } from "@/import/parse-ics";
import { PLANTED_SERIES, syntheticDiaries } from "@/import/testing/synthetic-diaries";
import { rows } from "@/domain/commands/testing/world";
import { toStored } from "@/screens/import/import-model";
import { AppProbe, cleanupApp, NOW, probe, renderApp } from "@/app/testing/render-app";
import { SeriesScreen } from "./series-screen";

afterEach(cleanupApp);

const WINDOW = { timeZone: "Europe/London", windowStart: "2026-10-01T00:00:00.000Z", windowEnd: "2027-02-01T00:00:00.000Z", privatePolicy: "mask" } as const;

const cellsOf = () =>
  screen.getAllByRole("button", { expanded: false }).map((b) => within(b.closest("tr")!).getAllByRole("cell").map((c) => c.textContent ?? ""));
const exceptionsShown = () => cellsOf().reduce((sum, cells) => sum + Number(cells[4]), 0);

test.each(["PRINCIPAL-A", "PRINCIPAL-B"])("%s: the series and exceptions shown match the synthetic diary's, before and after the update (B8)", async (code) => {
  const files = syntheticDiaries(new Date(NOW));
  const [base, update] = [`${code}.ics`, `${code}-update.ics`].map((name) => files.find((f) => f.fileName === name)!);
  const app = await renderApp({
    seed: (s) => {
      const principal = s.principal(code);
      s.run(importApply, { now: NOW, principal, file: base!.fileName, diff: diffImport([], parseIcs(base!.text, WINDOW)) });
    },
    children: <SeriesScreen />,
  });
  expect(cellsOf()).toHaveLength(PLANTED_SERIES[code]!.series);
  expect(exceptionsShown()).toBe(PLANTED_SERIES[code]!.exceptions);
  expect(cellsOf().map((cells) => cells[1])).toEqual(cellsOf().map(() => "Repeats"));

  const principal = rows(app.device, "principals").find((p) => p.code === code)!.id;
  const stored = toStored(rows(app.device, "events"), principal);
  app.seed.run(importApply, { now: NOW, principal, file: update!.fileName, diff: diffImport(stored, parseIcs(update!.text, WINDOW)) });
  expect(exceptionsShown()).toBe(PLANTED_SERIES[code]!.exceptionsAfterUpdate);
  // The import's own series records agree.
  const records = rows(app.device, "series").filter((r) => !r._deleted);
  expect(records.reduce((sum, r) => sum + (r.exceptions ?? 0), 0)).toBe(PLANTED_SERIES[code]!.exceptionsAfterUpdate);
});

test("standing clashes come first, and a series opens to its occurrences", async () => {
  const file = syntheticDiaries(new Date(NOW)).find((f) => f.fileName === "PRINCIPAL-A.ics")!;
  await renderApp({
    seed: (s) => {
      const principal = s.principal("PRINCIPAL-A");
      s.run(importApply, { now: NOW, principal, file: file.fileName, diff: diffImport([], parseIcs(file.text, WINDOW)) });
    },
    children: <><SeriesScreen /><AppProbe /></>,
  });
  const standing = within(screen.getByRole("region", { name: "Standing clashes" })).getAllByRole("listitem");
  expect(standing.map((li) => li.textContent)).toEqual(["Executive team clashes with Operations review on 8 of its 8 occurrences"]);

  fireEvent.click(screen.getByRole("button", { name: "Diary meeting" }));
  const list = screen.getByRole("list", { name: "Occurrences of Diary meeting" });
  const items = within(list).getAllByRole("button");
  expect(items).toHaveLength(8);
  expect(items.filter((b) => b.textContent?.includes("Moved"))).toHaveLength(1);
  fireEvent.click(items[0]!);
  expect(JSON.parse(probe().panel)).toMatchObject({ kind: "engagement" });
});

test("a principal with no recurring meetings sees an empty state", async () => {
  await renderApp({ seed: (s) => s.principal("PRINCIPAL-A"), children: <SeriesScreen /> });
  expect(screen.getByText("No recurring meetings")).toBeTruthy();
});
