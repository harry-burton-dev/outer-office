// The Stats screen: a row per principal for the month, an office total, and the month stepper.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { importApply } from "@/domain/commands";
import type { ImportDiff } from "@/import/types";
import { cleanupApp, NOW, renderApp } from "@/app/testing/render-app";
import { StatsScreen } from "./stats-screen";

afterEach(cleanupApp);

const meeting = (uid: string, start: string) => ({
  uid, recurrenceId: "", start, end: start, allDay: false, subject: uid, location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "2026-11-01T09:00:00Z",
});
const diff = (added: ImportDiff["added"]): ImportDiff => ({
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-31T00:00:00Z", added, changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0,
});
const cells = (label: string) => within(screen.getByRole("row", { name: new RegExp(`^${label}`) })).getAllByRole("cell").map((c) => c.textContent);

test("each principal gets a row for the month, with an office total, and the month steps", async () => {
  await renderApp({
    seed: (s) => {
      const a = s.principal("PA");
      s.principal("PB");
      s.run(importApply, { now: NOW, principal: a, file: "a.ics", diff: diff([meeting("m1", "2026-11-10T10:00:00Z"), meeting("m2", "2026-12-02T10:00:00Z")]) });
    },
    children: <StatsScreen />,
  });
  expect(screen.getByText("November 2026")).toBeTruthy();
  expect(cells("PA")).toEqual(["PA", "1", "–", "0"]);
  expect(cells("PB")).toEqual(["PB", "0", "–", "0"]);
  expect(cells("Office")).toEqual(["Office", "1", "–", "0"]);
  fireEvent.click(screen.getByRole("button", { name: "Next month" }));
  expect(screen.getByText("December 2026")).toBeTruthy();
  expect(cells("PA")[1]).toBe("1");
});
