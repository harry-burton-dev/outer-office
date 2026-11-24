// Needs action: the needs-you lane for the chosen principal (OUT-86). Each
// update opens its panel and can be snoozed, never dismissed.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { Sheet } from "@/components/ui/sheet";
import { overlaySet } from "@/domain/commands";
import { AppProbe, cleanupApp, NOW, probe, renderApp } from "@/app/testing/render-app";
import { eventIdOf, importEvents, markGone, syntheticEvent } from "@/screens/calendar/testing/events";
import { NeedsActionPanel } from "../needs-action-panel";

afterEach(cleanupApp);

const ui = <><Sheet open><NeedsActionPanel /></Sheet><AppProbe /></>;
const section = (name: string) => screen.getByRole("region", { name });

test("with nothing to do it says so, under the principal's code", async () => {
  await renderApp({ seed: (s) => void s.principal("PRINCIPAL-A"), children: ui });
  expect(await screen.findByRole("heading", { name: "Needs action" })).toBeTruthy();
  expect(screen.getByText("PRINCIPAL-A")).toBeTruthy();
  expect(screen.getByText("Nothing needs action")).toBeTruthy();
});

const rows = () => screen.queryAllByTestId("update").map((li) => li.textContent ?? "");

test("lists the chosen principal's overdue tasks, and Open shows the task", async () => {
  let overdue = "";
  await renderApp({
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A", { order: 1 });
      const b = s.principal("PRINCIPAL-B", { order: 2 });
      overdue = s.task({ title: "Overdue report", principal: a, due: "2026-11-20" });
      s.task({ title: "Other principal's task", principal: b, due: "2026-11-20" });
    },
    children: ui,
  });
  await screen.findByRole("heading", { name: "Needs action" });
  expect(rows()).toEqual([expect.stringMatching(/^Overdue.*Overdue report.*due Fri 20 Nov/)]);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  expect(probe().panel).toBe(JSON.stringify({ kind: "task", id: overdue }));
});

test("prep needed soon and a gone meeting with office data show and open the engagement panel", async () => {
  let soon = "";
  await renderApp({
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A");
      const goneEvent = syntheticEvent("g1", { subject: "Cancelled visit", start: "2026-11-25T10:00:00Z", end: "2026-11-25T11:00:00Z" });
      importEvents(s, NOW, a, [syntheticEvent("s1", { subject: "Board briefing", start: "2026-11-22T14:00:00Z", end: "2026-11-22T15:00:00Z" }), goneEvent]);
      soon = eventIdOf(s.device, a, "s1");
      s.run(overlaySet, { now: NOW, event: soon, prep: "needed" });
      s.run(overlaySet, { now: NOW, event: eventIdOf(s.device, a, "g1"), notes: "Rebook" });
      markGone(s, NOW, a, goneEvent);
    },
    children: ui,
  });
  await screen.findByRole("heading", { name: "Needs action" });
  expect(rows().sort()).toEqual([
    expect.stringMatching(/^Gone from Outlook with office data.*Cancelled visit/),
    expect.stringMatching(/^Prep needed.*Board briefing.*14:00/),
  ]);
  const prep = screen.getAllByTestId("update").find((li) => li.textContent?.includes("Board briefing"))!;
  fireEvent.click(within(prep).getByRole("button", { name: "Open" }));
  expect(probe().panel).toBe(JSON.stringify({ kind: "engagement", id: soon }));
});

test("a needs-you update offers Open and Snooze only; snoozing hides it", async () => {
  await renderApp({ seed: (s) => { const a = s.principal("PRINCIPAL-A"); s.task({ title: "Overdue report", principal: a, due: "2026-11-20" }); }, children: ui });
  const panel = await screen.findByRole("dialog");
  expect(within(panel).getAllByRole("button").map((b) => b.textContent)).toEqual(["Open", "Snooze", "Close"]);
  fireEvent.click(within(panel).getByRole("button", { name: "Snooze" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Until tomorrow" }));
  expect(await screen.findByText("Nothing needs action")).toBeTruthy();
});
