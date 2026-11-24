// The calendar screen: which events show, their marks, the header line, the
// empty state, and opening the engagement panel.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { overlaySet } from "@/domain/commands";
import { AppProbe, cleanupApp, probe, renderApp } from "@/app/testing/render-app";
import { CalendarScreen } from "../calendar-screen";
import { eventIdOf, importEvents, markGone, MONDAY_NOW, moveEvent, syntheticEvent } from "./testing/events";

afterEach(cleanupApp);

const ui = <><CalendarScreen /><AppProbe /></>;
const eventEl = (title: string) => screen.getByText(title, { exact: true }).closest<HTMLElement>("[data-event-face]");
const marksOn = (title: string) => Array.from(eventEl(title)?.querySelectorAll("[data-mark]") ?? []).map((m) => m.textContent);

test("shows the chosen principal's events and not the other principal's", async () => {
  await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A", { order: 1 });
      const b = s.principal("PRINCIPAL-B", { order: 2 });
      importEvents(s, MONDAY_NOW, a, [syntheticEvent("a1", { subject: "Budget review" })]);
      importEvents(s, MONDAY_NOW, b, [syntheticEvent("b1", { subject: "Site visit" })]);
    },
    children: ui,
  });
  expect(screen.getByText("Budget review")).toBeTruthy();
  expect(screen.queryByText("Site visit")).toBeNull();
});

test("a gone event is not on the calendar", async () => {
  await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A");
      const kept = syntheticEvent("a1", { subject: "Kept meeting" });
      const gone = syntheticEvent("a2", { subject: "Cancelled meeting", start: "2026-11-25T10:00:00Z", end: "2026-11-25T11:00:00Z" });
      importEvents(s, MONDAY_NOW, a, [kept, gone]);
      markGone(s, MONDAY_NOW, a, gone);
    },
    children: ui,
  });
  expect(screen.getByText("Kept meeting")).toBeTruthy();
  expect(screen.queryByText("Cancelled meeting")).toBeNull();
});

test("an event shows at most two marks, flagged before moved, and prep is not marked", async () => {
  await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A");
      const all = syntheticEvent("a1", { subject: "Everything" });
      const flaggedMoved = syntheticEvent("a2", { subject: "Flagged and moved", start: "2026-11-25T10:00:00Z", end: "2026-11-25T11:00:00Z" });
      importEvents(s, MONDAY_NOW, a, [all, flaggedMoved]);
      moveEvent(s, MONDAY_NOW, a, all, "2026-11-24T15:00:00Z", "2026-11-24T16:00:00Z");
      moveEvent(s, MONDAY_NOW, a, flaggedMoved, "2026-11-26T10:00:00Z", "2026-11-26T11:00:00Z");
      s.run(overlaySet, { now: MONDAY_NOW, event: eventIdOf(s.device, a, "a1"), prep: "needed", flagged: true });
      s.run(overlaySet, { now: MONDAY_NOW, event: eventIdOf(s.device, a, "a2"), flagged: true });
    },
    children: ui,
  });
  expect(marksOn("Everything")).toEqual(["Flagged", "Moved"]);
  expect(marksOn("Flagged and moved")).toEqual(["Flagged", "Moved"]);
});

test("a masked event shows 'Private, busy' and no marks", async () => {
  await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A");
      importEvents(s, MONDAY_NOW, a, [syntheticEvent("a1", { subject: "Private, busy", masked: true, location: "", organizer: "" })]);
      s.run(overlaySet, { now: MONDAY_NOW, event: eventIdOf(s.device, a, "a1"), prep: "needed", flagged: true });
    },
    children: ui,
  });
  expect(screen.getByText("Private, busy")).toBeTruthy();
  expect(marksOn("Private, busy")).toEqual([]);
});

test("clicking an event opens the engagement panel for it", async () => {
  let id = "";
  await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A");
      importEvents(s, MONDAY_NOW, a, [syntheticEvent("a1", { subject: "Budget review" })]);
      id = eventIdOf(s.device, a, "a1");
    },
    children: ui,
  });
  fireEvent.click(eventEl("Budget review") ?? screen.getByText("Budget review"));
  expect(probe().panel).toBe(JSON.stringify({ kind: "engagement", id }));
});

test("on a Saturday the week view opens on this week, with the weekend shown", async () => {
  await renderApp({
    now: "2026-11-28T09:00:00.000Z",
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A");
      importEvents(s, MONDAY_NOW, a, [syntheticEvent("a1", { subject: "Last week" }), syntheticEvent("a2", { subject: "Next week", start: "2026-12-01T10:00:00Z", end: "2026-12-01T11:00:00Z" })]);
    },
    children: ui,
  });
  expect(screen.getByText("Last week")).toBeTruthy();
  expect(screen.queryByText("Next week")).toBeNull();
  expect(screen.getByText(/Sat/)).toBeTruthy();
});

test("the header shows the principal and the latest import", async () => {
  await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A", { title: "First principal" });
      importEvents(s, MONDAY_NOW, a, [syntheticEvent("a1")]);
    },
    children: ui,
  });
  expect(screen.getByText("PRINCIPAL-A · First principal · Imported Mon 23 Nov 09:00 by user-a")).toBeTruthy();
});

test("the header names who imported", async () => {
  await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      s.user("user-a", "Alex Example");
      const a = s.principal("PRINCIPAL-A", { title: "First principal" });
      importEvents(s, MONDAY_NOW, a, [syntheticEvent("a1")]);
    },
    children: ui,
  });
  expect(screen.getByText("PRINCIPAL-A · First principal · Imported Mon 23 Nov 09:00 by Alex Example")).toBeTruthy();
});

test("a principal with no events shows the empty state, whose action goes to Import", async () => {
  await renderApp({ seed: (s) => void s.principal("PRINCIPAL-A"), children: ui });
  expect(screen.getByText("No calendar imported yet")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Import a calendar" }));
  expect(probe().screen).toBe("import");
});

test("a viewer sees the empty state without its action", async () => {
  await renderApp({ seed: (s) => { s.principal("PRINCIPAL-A"); s.viewer(); }, children: ui });
  expect(screen.getByText("No calendar imported yet")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Import a calendar" })).toBeNull();
});

test("clashing engagements carry a clash edge, a linked child is drawn inside its parent, and the day header sums the day", async () => {
  await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A");
      importEvents(s, MONDAY_NOW, a, [
        syntheticEvent("a1", { subject: "Budget review", start: "2026-11-24T09:00:00Z", end: "2026-11-24T10:00:00Z" }),
        syntheticEvent("a2", { subject: "Investor call", start: "2026-11-24T09:30:00Z", end: "2026-11-24T10:30:00Z", location: "Microsoft Teams Meeting" }),
        syntheticEvent("v", { subject: "Site visit", start: "2026-11-24T13:00:00Z", end: "2026-11-24T16:00:00Z" }),
        syntheticEvent("s", { subject: "Speech", start: "2026-11-24T14:00:00Z", end: "2026-11-24T14:30:00Z" }),
      ]);
      s.run(overlaySet, { now: MONDAY_NOW, event: eventIdOf(s.device, a, "s"), parent: eventIdOf(s.device, a, "v"), priority: 1 });
      s.run(overlaySet, { now: MONDAY_NOW, event: eventIdOf(s.device, a, "a1"), priority: 1 });
    },
    children: ui,
  });
  expect(eventEl("Budget review")?.textContent).toContain("Clash with Investor call");
  expect(eventEl("Budget review")?.querySelector("[data-priority='1']")).toBeTruthy();
  expect(eventEl("Site visit")?.querySelector("[data-linked-children]")?.textContent).toBe("14:00 Speech");
  expect(eventEl("Site visit")?.textContent).not.toContain("Clash");
  const summary = document.querySelector("[data-day-summary]");
  expect(summary?.textContent).toContain("1 clash");
  expect(document.querySelectorAll("[data-day-summary]")).toHaveLength(1);
});
