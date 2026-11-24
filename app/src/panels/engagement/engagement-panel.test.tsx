// The engagement panel: Outlook's fields as text, the flag, prep saved through
// overlay.set, follow-ups, viewer mode, and the states it must tolerate.
import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Sheet } from "@/components/ui/sheet";
import { overlaySet, tabTemplateSave, templateSave } from "@/domain/commands";
import { AppProbe, cleanupApp, probe, renderApp, type Seeder } from "@/app/testing/render-app";
import { eventIdOf, importEvents, markGone, MONDAY_NOW, moveEvent, syntheticEvent } from "@/screens/calendar/testing/events";
import { EngagementPanel } from "../engagement-panel";

afterEach(cleanupApp);

interface Seeded {
  principal: string;
  event: string;
}

async function openPanel(extra: (s: Seeder, seeded: Seeded) => void = () => undefined, closable = false) {
  const seeded: Seeded = { principal: "", event: "" };
  const app = await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      seeded.principal = s.principal("PRINCIPAL-A");
      importEvents(s, MONDAY_NOW, seeded.principal, [syntheticEvent("a1", { subject: "Budget review" })]);
      seeded.event = eventIdOf(s.device, seeded.principal, "a1");
      extra(s, seeded);
    },
    children: <>{closable ? <ClosableSheet seeded={seeded} /> : <Sheet open><PanelFor seeded={seeded} /></Sheet>}<AppProbe /></>,
  });
  return { app, ...seeded };
}

/** A sheet that closes the way the app's does: Escape sets open to false. */
function ClosableSheet({ seeded }: PanelForProps) {
  const [open, setOpen] = useState(true);
  return <Sheet open={open} onOpenChange={setOpen}>{open && <PanelFor seeded={seeded} />}</Sheet>;
}

interface PanelForProps {
  seeded: { event: string };
}

/** Reads the id at render time: the seed runs before the first render. */
function PanelFor({ seeded }: PanelForProps) {
  return <EngagementPanel eventId={seeded.event} />;
}

const rows = (device: Seeder["device"], table: "overlays" | "log" | "tasks" | "cards" | "tabs") =>
  (device.data.view(table).rows() as unknown as ReadonlyArray<Record<string, unknown>>).filter((r) => !r._deleted);

test("the title is the subject and the time is shown in the office zone", async () => {
  await openPanel();
  expect(await screen.findByRole("heading", { name: "Budget review" })).toBeTruthy();
  expect(screen.getByText("Tue 24 Nov, 14:00–15:00")).toBeTruthy();
});

test("the overview shows Outlook's fields as text and no inputs for them", async () => {
  await openPanel((s, { principal }) => moveEvent(s, MONDAY_NOW, principal, syntheticEvent("a1", { subject: "Budget review" }), "2026-11-24T15:00:00Z", "2026-11-24T16:00:00Z"));
  const panel = await screen.findByRole("dialog");
  expect(within(panel).getByText("Room 1")).toBeTruthy();
  expect(within(panel).getByText("organiser@example.com")).toBeTruthy();
  expect(within(panel).getByText("Internal")).toBeTruthy();
  expect(within(panel).getByText("Moved 1 time")).toBeTruthy();
  expect(within(panel).getByText("Change this in Outlook, then import again")).toBeTruthy();
  expect(within(panel).queryAllByRole("textbox")).toHaveLength(0);
});

test("the flag switch writes the overlay and a log row", async () => {
  const { app } = await openPanel();
  fireEvent.click(await screen.findByRole("switch", { name: "Flag" }));
  expect(rows(app.device, "overlays")[0]).toMatchObject({ flagged: true });
  expect(rows(app.device, "log").filter((r) => r.area === "overlay")).toEqual([expect.objectContaining({ kind: "flag", to: "true" })]);
});

test("a card from a template goes on the meeting as its own tab, and fills in", async () => {
  const { app } = await openPanel((s) => {
    s.run(templateSave, { now: MONDAY_NOW, name: "POC", shape: "user", fields: [{ id: "name", label: "Point of contact", type: "text", required: true }] });
  });
  fireEvent.click(await screen.findByRole("button", { name: "Add a tab or card" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "POC" }));
  expect(await screen.findByRole("tab", { name: "POC" })).toBeTruthy();
  expect(screen.getByText("0 of 1 done")).toBeTruthy();
  const contact = screen.getByRole("textbox", { name: "Point of contact *" });
  fireEvent.change(contact, { target: { value: "Avery Stone" } });
  fireEvent.blur(contact);
  expect(rows(app.device, "cards")[0]?.values).toBe(JSON.stringify({ name: "Avery Stone" }));
  expect(await screen.findByText("1 of 1 done")).toBeTruthy();
});

test("a tab from a tab template goes on the meeting with its cards, and can be updated or removed", async () => {
  const { app } = await openPanel((s) => {
    const poc = s.run(templateSave, { now: MONDAY_NOW, name: "POC", shape: "user", fields: [{ id: "name", label: "Point of contact", type: "text", required: true }] });
    const dial = s.run(templateSave, { now: MONDAY_NOW, name: "Dial-in", shape: "phone", fields: [{ id: "num", label: "Number", type: "phone" }] });
    s.run(tabTemplateSave, { now: MONDAY_NOW, name: "Board meeting", shape: "briefcase", cards: [poc, dial] });
  });
  fireEvent.click(await screen.findByRole("button", { name: "Add a tab or card" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Board meeting" }));
  expect(await screen.findByRole("tab", { name: "Board meeting" })).toBeTruthy();
  expect(screen.getByText("POC")).toBeTruthy();
  expect(screen.getByText("Dial-in")).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Point of contact *" })).toBeTruthy();
  expect(rows(app.device, "cards")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Update to the latest" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Remove tab" }));
  expect(rows(app.device, "cards")).toHaveLength(0);
  expect(rows(app.device, "tabs")).toHaveLength(0);
});

test("notes save on blur, not while typing", async () => {
  const { app } = await openPanel();
  fireEvent.click(await screen.findByRole("tab", { name: "Notes" }));
  const notes = screen.getByRole("textbox", { name: "Notes" });
  fireEvent.change(notes, { target: { value: "Bring the figures" } });
  expect(rows(app.device, "overlays")).toHaveLength(0);
  fireEvent.blur(notes);
  expect(rows(app.device, "overlays")[0]).toMatchObject({ notes: "Bring the figures" });
});

test("notes and card fields typed and left by pressing Escape are kept", async () => {
  const { app } = await openPanel((s) => {
    s.run(templateSave, { now: MONDAY_NOW, name: "POC", shape: "user", fields: [{ id: "name", label: "Point of contact", type: "text", required: true }] });
  }, true);
  fireEvent.click(await screen.findByRole("button", { name: "Add a tab or card" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "POC" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Point of contact *" }), { target: { value: "Avery Stone" } });
  fireEvent.click(screen.getByRole("tab", { name: "Notes" }));
  const notes = screen.getByRole("textbox", { name: "Notes" });
  notes.focus();
  fireEvent.change(notes, { target: { value: "Bring the figures" } });
  fireEvent.keyDown(notes, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(rows(app.device, "overlays")[0]).toMatchObject({ notes: "Bring the figures" });
  expect(rows(app.device, "cards")[0]?.values).toBe(JSON.stringify({ name: "Avery Stone" }));
});

test("add follow-up creates a task linked to the event and tagged to the principal", async () => {
  const { app, principal, event } = await openPanel();
  fireEvent.click(await screen.findByRole("tab", { name: "Notes" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Follow-up" }), { target: { value: "Send the minutes" } });
  fireEvent.click(screen.getByRole("button", { name: "Add follow-up" }));
  expect(rows(app.device, "tasks")).toEqual([expect.objectContaining({ title: "Send the minutes", event, principal })]);
  const row = await screen.findByRole("button", { name: /Send the minutes/ });
  fireEvent.click(row);
  expect(JSON.parse(probe().panel)).toMatchObject({ kind: "task" });
});

test("a viewer sees values as text and no write controls", async () => {
  await openPanel((s, { event }) => {
    s.run(overlaySet, { now: MONDAY_NOW, event, notes: "Bring the figures" });
    s.viewer();
  });
  const panel = await screen.findByRole("dialog");
  expect(within(panel).queryByRole("switch")).toBeNull();
  fireEvent.click(within(panel).getByRole("tab", { name: "Notes" }));
  expect(within(panel).getByText("Bring the figures")).toBeTruthy();
  expect(within(panel).queryByRole("combobox")).toBeNull();
  expect(within(panel).queryAllByRole("textbox")).toHaveLength(0);
  expect(within(panel).queryByRole("button", { name: "Add follow-up" })).toBeNull();
});

test("an event that has not synced yet says so", async () => {
  await renderApp({ seed: (s) => void s.principal("PRINCIPAL-A"), children: <Sheet open><EngagementPanel eventId="missing" /></Sheet> });
  expect(await screen.findByText("This engagement has not synced yet.")).toBeTruthy();
});

test("a gone event shows a notice at the top", async () => {
  await openPanel((s, { principal }) => markGone(s, MONDAY_NOW, principal, syntheticEvent("a1")));
  expect(await screen.findByText("No longer in Outlook.")).toBeTruthy();
});

test("a masked event shows no details", async () => {
  const seeded = { event: "" };
  await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A");
      importEvents(s, MONDAY_NOW, a, [syntheticEvent("m1", { subject: "Secret subject", masked: true, location: "Hidden room" })]);
      seeded.event = eventIdOf(s.device, a, "m1");
    },
    children: <Sheet open><PanelFor seeded={seeded} /></Sheet>,
  });
  expect(await screen.findByRole("heading", { name: "Private, busy" })).toBeTruthy();
  expect(screen.queryByText("Secret subject")).toBeNull();
  expect(screen.queryByText("Hidden room")).toBeNull();
});
