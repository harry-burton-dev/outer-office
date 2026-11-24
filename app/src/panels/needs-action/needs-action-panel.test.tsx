// Needs action: four sections, each only when it has content; rows open the
// right panel; nothing else to press.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { Sheet } from "@/components/ui/sheet";
import { overlaySet, tabApply, tabTemplateSave, templateSave } from "@/domain/commands";
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

test("only the sections with content appear, and task rows open the task panel", async () => {
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
  const list = await screen.findByRole("region", { name: "Overdue" });
  expect(within(list).getByText("Fri 20 Nov")).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Due today" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Prep needed" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Gone from Outlook" })).toBeNull();
  expect(screen.queryByText("Other principal's task")).toBeNull();

  fireEvent.click(within(list).getByRole("button", { name: /Overdue report/ }));

  expect(probe().panel).toBe(JSON.stringify({ kind: "task", id: overdue }));
});

test("prep needed and gone engagements show and open the engagement panel", async () => {
  let soon = "";
  await renderApp({
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A");
      const goneEvent = syntheticEvent("g1", { subject: "Cancelled visit", start: "2026-11-25T10:00:00Z", end: "2026-11-25T11:00:00Z" });
      importEvents(s, NOW, a, [syntheticEvent("s1", { subject: "Board briefing", start: "2026-11-22T14:00:00Z", end: "2026-11-22T15:00:00Z" }), goneEvent]);
      soon = eventIdOf(s.device, a, "s1");
      const brief = s.run(templateSave, { now: NOW, name: "Brief", fields: [{ id: "who", label: "Who", type: "text", required: true }] });
      s.run(tabApply, { now: NOW, event: soon, tabTemplate: s.run(tabTemplateSave, { now: NOW, name: "Board", cards: [brief] }) });
      s.run(overlaySet, { now: NOW, event: eventIdOf(s.device, a, "g1"), notes: "Rebook" });
      markGone(s, NOW, a, goneEvent);
      s.task({ title: "Due today task", principal: a, due: "2026-11-22" });
    },
    children: ui,
  });
  const prep = await screen.findByRole("region", { name: "Prep needed" });
  expect(within(prep).getByText("14:00")).toBeTruthy();
  expect(within(section("Gone from Outlook")).getByText("Cancelled visit")).toBeTruthy();
  expect(within(section("Due today")).getByText("Due today task")).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Overdue" })).toBeNull();

  fireEvent.click(within(prep).getByRole("button", { name: /Board briefing/ }));

  expect(probe().panel).toBe(JSON.stringify({ kind: "engagement", id: soon }));
});

test("the only buttons are the rows and the close button", async () => {
  await renderApp({ seed: (s) => { const a = s.principal("PRINCIPAL-A"); s.task({ title: "Overdue report", principal: a, due: "2026-11-20" }); }, children: ui });
  const panel = await screen.findByRole("dialog");
  expect(within(panel).getAllByRole("button").map((b) => b.textContent)).toEqual([expect.stringContaining("Overdue report"), "Close"]);
});
