// Moving an engagement on the calendar (OUT-85): a drag or a keyboard move makes
// one proposal and never changes the diary (B16); masked, gone, archived and
// all-day engagements can't be moved (B17); Ctrl+Z straight after takes it back.
// jsdom has no layout, so the keyboard stands in for the mouse: both end in the
// same onMove (diary-calendar.test.tsx covers the calendar's side).
import { afterEach, expect, test } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { overlaySet, proposalMove } from "@/domain/commands";
import { cleanupApp, renderApp, type RenderedApp, type Seeder } from "@/app/testing/render-app";
import { CalendarScreen } from "../calendar-screen";
import { eventIdOf, importEvents, markGone, MONDAY_NOW, syntheticEvent } from "./testing/events";

afterEach(cleanupApp);

type Row = { id: string; _deleted?: boolean } & Record<string, unknown>;
const rows = (app: RenderedApp, table: "events" | "proposals"): Row[] =>
  (app.device.data.view(table).rows() as unknown as Row[]).filter((r) => !r._deleted);

const entry = (title: string) => {
  const box = screen.getByText(title, { exact: true }).closest<HTMLElement>("[data-entry-id]");
  if (!box) throw new Error(`no entry ${title}`);
  return box;
};
const keys = (title: string, ...names: string[]) => {
  const box = entry(title).closest<HTMLElement>("[tabindex], a") ?? entry(title);
  for (const key of names) fireEvent.keyDown(box, { key });
};

async function diary(more: (s: Seeder, a: string) => void = () => {}) {
  let a = "";
  const app = await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      a = s.principal("PRINCIPAL-A");
      importEvents(s, MONDAY_NOW, a, [syntheticEvent("a1", { subject: "Budget review" })]);
      more(s, a);
    },
    children: <CalendarScreen />,
  });
  return { app, a, id: eventIdOf(app.device, a, "a1") };
}

test("a keyboard move makes one proposal.move and changes nothing in events (B16)", async () => {
  const { app, id } = await diary();
  const before = JSON.stringify(rows(app, "events"));
  keys("Budget review", "ArrowDown", "ArrowDown", "ArrowRight", "Enter");
  const proposals = rows(app, "proposals");
  expect(proposals).toHaveLength(1);
  expect(proposals[0]).toMatchObject({ kind: "move", event: id, start: "2026-11-25T14:30:00.000Z", end: "2026-11-25T15:30:00.000Z" });
  expect(JSON.stringify(rows(app, "events"))).toBe(before);
  expect(screen.getByText(/Budget review proposed for Wed 25 Nov, 14:30\. Outlook is unchanged\./)).toBeTruthy();
});

test("masked, gone, archived and all-day engagements can't be moved (B17)", async () => {
  const { app } = await diary((s, a) => {
    importEvents(s, MONDAY_NOW, a, [
      syntheticEvent("m", { subject: "Private, busy", masked: true, start: "2026-11-24T09:00:00Z", end: "2026-11-24T10:00:00Z" }),
      syntheticEvent("d", { subject: "Away all day", allDay: true, start: "2026-11-26T00:00:00Z", end: "2026-11-27T00:00:00Z" }),
      syntheticEvent("x", { subject: "Archived one", start: "2026-11-25T09:00:00Z", end: "2026-11-25T10:00:00Z" }),
    ]);
    s.run(overlaySet, { now: MONDAY_NOW, event: eventIdOf(s.device, a, "x"), archived: true, archiveReason: "cancelled" });
    const gone = syntheticEvent("g", { subject: "Gone one", start: "2026-11-27T09:00:00Z", end: "2026-11-27T10:00:00Z" });
    importEvents(s, MONDAY_NOW, a, [gone]);
    markGone(s, MONDAY_NOW, a, gone);
  });
  keys("Private, busy", "ArrowDown", "Enter");
  keys("Away all day", "ArrowDown", "Enter");
  expect(entry("Private, busy").hasAttribute("data-movable")).toBe(false);
  expect(entry("Away all day").hasAttribute("data-movable")).toBe(false);
  expect(entry("Budget review").hasAttribute("data-movable")).toBe(true);
  // Archived and gone ones aren't on the live diary at all, and nothing on the graveyard moves.
  expect(screen.queryByText("Archived one", { exact: true })).toBeNull();
  expect(screen.queryByText("Gone one", { exact: true })).toBeNull();
  expect(rows(app, "proposals")).toHaveLength(0);
});

test("a viewer can't move anything", async () => {
  const { app } = await diary((s) => s.viewer());
  expect(entry("Budget review").hasAttribute("data-movable")).toBe(false);
  keys("Budget review", "ArrowDown", "Enter");
  expect(rows(app, "proposals")).toHaveLength(0);
});

test("Ctrl+Z straight after a move withdraws the proposal it made", async () => {
  const { app } = await diary();
  keys("Budget review", "ArrowDown", "Enter");
  expect(rows(app, "proposals")).toHaveLength(1);
  act(() => void fireEvent.keyDown(window, { key: "z", ctrlKey: true }));
  expect(rows(app, "proposals")).toHaveLength(0);
  expect(screen.queryByText(/proposed for/)).toBeNull();
});

test("Ctrl+Z after moving a proposal again puts back the earlier proposal", async () => {
  const { app, id } = await diary((s, a) => {
    s.run(proposalMove, { now: MONDAY_NOW, event: eventIdOf(s.device, a, "a1"), start: "2026-11-24T16:00:00Z", end: "2026-11-24T17:00:00Z" });
  });
  // On the live diary the engagement is drawn where Outlook has it, as a ghost of its proposal.
  keys("Budget review", "ArrowUp", "Enter");
  expect(rows(app, "proposals")[0]).toMatchObject({ event: id, start: "2026-11-24T13:45:00.000Z" });
  act(() => void fireEvent.keyDown(window, { key: "z", ctrlKey: true }));
  expect(rows(app, "proposals")).toHaveLength(1);
  expect(rows(app, "proposals")[0]).toMatchObject({ event: id, start: "2026-11-24T16:00:00Z", end: "2026-11-24T17:00:00Z" });
});

test("on the Proposed layer the proposal moves, its ghost doesn't, and back to Outlook's time withdraws it", async () => {
  const { app, id } = await diary((s, a) => {
    s.run(proposalMove, { now: MONDAY_NOW, event: eventIdOf(s.device, a, "a1"), start: "2026-11-24T15:00:00Z", end: "2026-11-24T16:00:00Z" });
  });
  fireEvent.click(screen.getByRole("button", { name: "Up to Proposed" }));
  const boxes = screen.getAllByText("Budget review", { exact: true }).map((t) => t.closest<HTMLElement>("[data-entry-id]")!);
  expect(boxes.filter((b) => b.hasAttribute("data-movable"))).toHaveLength(1);
  const proposal = boxes.find((b) => b.hasAttribute("data-movable"))!;
  const target = proposal.closest<HTMLElement>("[tabindex], a") ?? proposal;
  fireEvent.keyDown(target, { key: "ArrowDown" });
  fireEvent.keyDown(target, { key: "Enter" });
  expect(rows(app, "proposals")[0]).toMatchObject({ event: id, start: "2026-11-24T15:15:00.000Z" });
  const again = screen.getAllByText("Budget review", { exact: true }).map((t) => t.closest<HTMLElement>("[data-entry-id]")!).find((b) => b.hasAttribute("data-movable"))!;
  const key = again.closest<HTMLElement>("[tabindex], a") ?? again;
  for (const k of ["ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "Enter"]) fireEvent.keyDown(key, { key: k });
  expect(rows(app, "proposals")).toHaveLength(0);
});
