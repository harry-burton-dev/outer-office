// The Print screen's day sheet, rendered from seeded data: what each
// engagement carries, what is left off, and the print button.
import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { cardAdd, cardSet, overlaySet, tagSave, templateSave } from "@/domain/commands";
import { useApp } from "@/app/app-state";
import { cleanupApp, renderApp, type Seeder } from "@/app/testing/render-app";
import { eventIdOf, importEvents, MONDAY_NOW, syntheticEvent } from "../calendar/testing/events";
import { PrintScreen } from "../print-screen";

afterEach(cleanupApp);

const TUESDAY = "2026-11-24";

function seedDay(s: Seeder): string {
  const a = s.principal("PRINCIPAL-A");
  s.user("user-b", "Sam Jones");
  s.run(tagSave, { now: MONDAY_NOW, name: "Board", colour: "#818cf8" });
  importEvents(s, MONDAY_NOW, a, [
    syntheticEvent("a1", { subject: "Budget review", location: "Room 4", categories: "Board", requiredAttendees: "Ann Lee <ann@example.com> · Accepted\nBo Chan <bo@example.com> · Tentative" }),
    syntheticEvent("a2", { subject: "Doctor", masked: true, start: "2026-11-24T09:00:00Z", end: "2026-11-24T10:00:00Z" }),
    syntheticEvent("a3", { subject: "Wednesday meeting", start: "2026-11-25T10:00:00Z", end: "2026-11-25T11:00:00Z" }),
    syntheticEvent("a4", { subject: "Archived meeting", start: "2026-11-24T16:00:00Z", end: "2026-11-24T17:00:00Z" }),
    syntheticEvent("a5", { subject: "Travel day", allDay: true, start: "2026-11-24T00:00:00Z", end: "2026-11-25T00:00:00Z" }),
  ]);
  const budget = eventIdOf(s.device, a, "a1");
  s.run(overlaySet, { now: MONDAY_NOW, event: budget, notes: "Bring the Q3 figures", flagged: true });
  s.run(overlaySet, { now: MONDAY_NOW, event: eventIdOf(s.device, a, "a4"), archived: true });
  const template = s.run(templateSave, {
    now: MONDAY_NOW, name: "Visit", shape: "users",
    fields: [
      { id: "host", label: "Host", type: "person", required: true },
      { id: "dial", label: "Dial-in", type: "choice", options: "Teams bridge | 020 7946 0000\nIn person", required: true },
      { id: "brief", label: "Brief", type: "longtext" },
    ],
  });
  const card = s.run(cardAdd, { now: MONDAY_NOW, event: budget, template });
  s.run(cardSet, { now: MONDAY_NOW, id: card, values: { host: "user-b", dial: "Teams bridge" } });
  s.task({ title: "Send the minutes", event: budget, principal: a, assignee: "user-b", due: "2026-11-25" });
  return a;
}

/** The screen for the chosen principal, as the app shows it. */
function Chosen() {
  const { principalId } = useApp();
  return principalId ? <PrintScreen principalId={principalId} /> : null;
}

test("opens on today and prints the day chosen", async () => {
  await renderApp({ now: MONDAY_NOW, seed: (s) => void seedDay(s), children: <Chosen /> });
  expect(screen.getByRole("article", { name: "Monday 23 November 2026" })).toBeTruthy();
  expect(screen.getByText("Nothing in the diary.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Day"), { target: { value: TUESDAY } });
  expect(screen.getByRole("article", { name: "Tuesday 24 November 2026" })).toBeTruthy();
});

test("each engagement carries its time, place, tags, attendees, cards, notes and follow-ups with owners", async () => {
  await renderApp({ now: MONDAY_NOW, seed: (s) => void seedDay(s), children: <Chosen /> });
  fireEvent.change(screen.getByLabelText("Day"), { target: { value: TUESDAY } });
  const entry = screen.getByText("Budget review").closest<HTMLElement>("[data-sheet-entry]")!;
  const e = within(entry);
  expect(e.getByText("14:00–15:00")).toBeTruthy();
  expect(e.getByText("Room 4 · Board · Flagged")).toBeTruthy();
  expect(entry.textContent).toContain("Ann Lee, Bo Chan");
  const card = e.getByRole("region", { name: "Visit" });
  expect(card.textContent).toContain("2 of 2 done");
  expect(card.textContent).toContain("HostSam Jones");
  expect(card.textContent).toContain("Dial-inTeams bridge (020 7946 0000)");
  expect(card.textContent).not.toContain("Brief");
  expect(e.getByRole("region", { name: "Notes" }).textContent).toContain("Bring the Q3 figures");
  expect(e.getByRole("region", { name: "Follow-ups" }).textContent).toContain("Send the minutes · Sam Jones, due 25 Nov");
});

test("all-day first, a private item shows its time only, and archived or other days are left off", async () => {
  await renderApp({ now: MONDAY_NOW, seed: (s) => void seedDay(s), children: <Chosen /> });
  fireEvent.change(screen.getByLabelText("Day"), { target: { value: TUESDAY } });
  const titles = Array.from(document.querySelectorAll("[data-sheet-entry] h3")).map((h) => h.textContent);
  expect(titles).toEqual(["Travel day", "Private, busy", "Budget review"]);
  expect(screen.queryByText("Doctor")).toBeNull();
  expect(screen.queryByText("Archived meeting")).toBeNull();
  expect(screen.queryByText("Wednesday meeting")).toBeNull();
  expect(screen.getByText("All day")).toBeTruthy();
});

test("Print opens the browser's print dialog", async () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
  await renderApp({ now: MONDAY_NOW, seed: (s) => void seedDay(s), children: <Chosen /> });
  fireEvent.click(screen.getByRole("button", { name: "Print" }));
  expect(print).toHaveBeenCalledOnce();
  print.mockRestore();
});
