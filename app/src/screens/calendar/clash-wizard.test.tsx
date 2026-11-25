// The clash wizard on the calendar (OUT-85, brief 8.2): opened from the toolbar's
// "Clashes (n)", nothing changes before Apply (B22), and Apply makes the fixes.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { overlaySet } from "@/domain/commands";
import { cleanupApp, renderApp, type RenderedApp, type Seeder } from "@/app/testing/render-app";
import { CalendarScreen } from "../calendar-screen";
import { eventIdOf, importEvents, MONDAY_NOW, syntheticEvent } from "./testing/events";

afterEach(cleanupApp);

const snapshot = (app: RenderedApp) => JSON.stringify(["events", "overlays", "proposals"].map((t) => app.device.data.view(t as "events").rows()));
const proposals = (app: RenderedApp) => (app.device.data.view("proposals").rows() as unknown as Array<{ _deleted?: boolean; event?: string; start?: string }>).filter((p) => !p._deleted);

async function clashing(more?: (s: Seeder, a: string) => void) {
  let ids: Record<string, string> = {};
  const app = await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A");
      importEvents(s, MONDAY_NOW, a, [
        syntheticEvent("a1", { subject: "Budget review", start: "2026-11-24T14:00:00Z", end: "2026-11-24T15:00:00Z" }),
        syntheticEvent("a2", { subject: "Press call", start: "2026-11-24T14:30:00Z", end: "2026-11-24T15:00:00Z" }),
      ]);
      ids = { budget: eventIdOf(s.device, a, "a1"), press: eventIdOf(s.device, a, "a2") };
      more?.(s, a);
    },
    children: <CalendarScreen />,
  });
  return { app, ids };
}

test("the toolbar counts the clashes shown and opens the wizard on them", async () => {
  await clashing();
  fireEvent.click(screen.getByRole("button", { name: "Clashes (1)" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Hard clash")).toBeTruthy();
  expect(within(dialog).getByText("1 of 1")).toBeTruthy();
  // The shorter one gives way first; the first suggestion is chosen until you pick another.
  const options = within(dialog).getAllByRole("radio").map((r) => r.closest("label")?.textContent);
  expect(options.slice(0, 3)).toEqual(["Move Press call to Tue 24 Nov, 08:00", "Move Budget review to Tue 24 Nov, 08:00", "Set Press call quiet"]);
  expect((within(dialog).getAllByRole("radio")[0] as HTMLInputElement).checked).toBe(true);
});

test("a day header's clash count opens the wizard on that day's clashes only", async () => {
  await clashing((s, a) => importEvents(s, MONDAY_NOW, a, [
    syntheticEvent("w1", { subject: "Wednesday one", start: "2026-11-25T10:00:00Z", end: "2026-11-25T11:00:00Z" }),
    syntheticEvent("w2", { subject: "Wednesday two", start: "2026-11-25T10:30:00Z", end: "2026-11-25T11:30:00Z" }),
  ]));
  expect(screen.getByRole("button", { name: "Clashes (2)" })).toBeTruthy();
  const opens = document.querySelectorAll<HTMLButtonElement>("[data-open-wizard]");
  expect(opens).toHaveLength(2);
  fireEvent.click(opens[0]!);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("1 of 1")).toBeTruthy();
  expect(within(dialog).getAllByRole("radio")[0]?.closest("label")?.textContent).toContain("Press call");
});

test("Cancel, at a step or at the end, changes nothing (B22)", async () => {
  const { app } = await clashing();
  const before = snapshot(app);
  fireEvent.click(screen.getByRole("button", { name: "Clashes (1)" }));
  fireEvent.click(screen.getByRole("radio", { name: "Set Press call quiet" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clashes (1)" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("list", { name: "Chosen fixes" }).textContent).toBe("Move Press call to Tue 24 Nov, 08:00");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(snapshot(app)).toBe(before);
});

test("Apply makes the chosen fixes: a move becomes a proposal and Outlook's copy stays", async () => {
  const { app, ids } = await clashing();
  const events = JSON.stringify(app.device.data.view("events").rows());
  fireEvent.click(screen.getByRole("button", { name: "Clashes (1)" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(proposals(app)).toEqual([expect.objectContaining({ event: ids.press, start: "2026-11-24T08:00:00.000Z" })]);
  expect(JSON.stringify(app.device.data.view("events").rows())).toBe(events);
});

test("a fix of your own: a note goes on both engagements", async () => {
  const { app, ids } = await clashing();
  fireEvent.click(screen.getByRole("button", { name: "Clashes (1)" }));
  fireEvent.click(screen.getByRole("radio", { name: "Add a note to both" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "Ask the press office" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  const overlays = app.device.data.view("overlays").rows() as unknown as Array<{ event?: string; notes?: string }>;
  for (const id of [ids.budget, ids.press]) expect(overlays.find((o) => o.event === id)?.notes).toBe("Mon 23 Nov: Ask the press office");
});

test("Skip leaves the clash, and with nothing chosen Apply is off", async () => {
  await clashing();
  fireEvent.click(screen.getByRole("button", { name: "Clashes (1)" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  expect(screen.getByText("Every clash is left as it is.")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(true);
});

test("quiet engagements aren't counted", async () => {
  await clashing((s, a) => s.run(overlaySet, { now: MONDAY_NOW, event: eventIdOf(s.device, a, "a2"), quiet: true }));
  expect(screen.queryByRole("button", { name: /^Clashes/ })).toBeNull();
});

test("a viewer's wizard makes suggestions and changes nothing else (D15)", async () => {
  const { app, ids } = await clashing((s) => s.viewer());
  const before = snapshot(app);
  fireEvent.click(screen.getByRole("button", { name: "Clashes (1)" }));
  fireEvent.click(screen.getByRole("radio", { name: "Add a note to both" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "Ask about the call" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Suggest these fixes?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
  expect(snapshot(app)).toBe(before);
  const made = (app.device.data.view("suggestions").rows() as unknown as Array<{ event?: string; kind?: string; note?: string; state?: string }>);
  expect(made.map((r) => [r.event, r.kind, r.note, r.state]).sort()).toEqual([[ids.budget, "note", "Ask about the call", "open"], [ids.press, "note", "Ask about the call", "open"]].sort());
});

test("Only clashes filters the diary to the clashing engagements, and back (8.1)", async () => {
  await clashing((s, a) => importEvents(s, MONDAY_NOW, a, [syntheticEvent("a3", { subject: "Quiet lunch", start: "2026-11-24T12:00:00Z", end: "2026-11-24T13:00:00Z" })]));
  expect(screen.getByText("Quiet lunch")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Only clashes" }));
  expect(screen.getByRole("button", { name: "Only clashes" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByText("Quiet lunch")).toBeNull();
  expect(screen.getByText("Budget review")).toBeTruthy();
  expect(screen.getByText("Press call")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Only clashes" }));
  expect(screen.getByText("Quiet lunch")).toBeTruthy();
});
