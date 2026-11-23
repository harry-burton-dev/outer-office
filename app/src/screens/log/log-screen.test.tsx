// The Log screen: the chosen principal's rows, newest first, by area, with
// subjects resolved and rows that open their panel.
import { afterEach, describe, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { defineCommand, type Tx } from "@trellis/framework";
import { importApply, projectSave, sectionSave, taskAssign, taskLink, taskMove } from "@/domain/commands";
import { AppProbe, cleanupApp, NOW, probe, renderApp, type Seeder } from "@/app/testing/render-app";
import { idOf, rows } from "@/domain/commands/testing/world";
import { LogScreen } from "../log-screen";

afterEach(cleanupApp);

interface LogSeed {
  principal: string;
  count: number;
  area?: string;
  event?: string;
}

// Test-only: writes log rows directly, a minute apart, ending at NOW.
const writeLogRows = defineCommand("test.log.write", (tx: Tx, input: LogSeed) => {
  for (let i = 0; i < input.count; i += 1) {
    const at = new Date(Date.parse(NOW) - (input.count - i) * 60_000).toISOString();
    tx.put("log", tx.newId(), { at, by: "user-a", principal: input.principal, area: input.area ?? "setup", kind: "edited", event: input.event ?? "", task: "", from: "", to: "", note: `Row ${i}` });
  }
});

// Test-only: a principal with no log row, which principal.save never leaves.
const putPrincipal = defineCommand("test.log.putPrincipal", (tx: Tx, input: { code: string }) => {
  tx.put("principals", tx.id("principal", input.code), { code: input.code, title: "Principal", order: 1, active: true });
});

const MEETING = { uid: "m1", recurrenceId: "", start: "2026-11-24T14:00:00.000Z", end: "2026-11-24T15:00:00.000Z", allDay: false, subject: "Budget meeting", location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "" };
const DIFF = { rangeStart: "2026-11-01T00:00:00.000Z", rangeEnd: "2026-11-30T00:00:00.000Z", added: [MEETING], changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0 };

const idFor = (s: Seeder, code: string) => rows(s.device, "principals").find((p) => p.code === code)!.id;

function seedTwo(s: Seeder) {
  s.principal("PRINCIPAL-A");
  s.principal("PRINCIPAL-B");
  const [a, b] = [idFor(s, "PRINCIPAL-A"), idFor(s, "PRINCIPAL-B")];
  s.run(importApply, { now: NOW, principal: a, file: "a.ics", diff: DIFF });
  s.task({ title: "Draft speech", principal: a });
  s.task({ title: "Book travel", principal: b });
}

const bodyRows = () => within(screen.getByRole("table", { name: "Log" })).getAllByRole("row").slice(1);
const column = (index: number) => bodyRows().map((r) => within(r).getAllByRole("cell")[index]!.textContent);

async function chooseArea(label: string) {
  fireEvent.click(screen.getByRole("combobox", { name: "Area" }));
  const option = await screen.findByRole("option", { name: label });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}

describe("log screen", () => {
  test("shows only the chosen principal's rows, with subjects resolved", async () => {
    await renderApp({ seed: seedTwo, children: <LogScreen /> });
    const subjects = column(4);
    expect(subjects).toContain("Budget meeting");
    expect(subjects).toContain("Draft speech");
    expect(subjects).not.toContain("Book travel");
    expect(column(3)).toEqual(expect.arrayContaining(["Added", "Import applied", "Created"]));
  });

  test("filters by area", async () => {
    await renderApp({ seed: seedTwo, children: <LogScreen /> });
    await chooseArea("Task");
    expect(column(2)).toEqual(["Task"]);
    expect(column(4)).toEqual(["Draft speech"]);
    await chooseArea("Calendar");
    expect(column(4)).toEqual(["Budget meeting"]);
  });

  test("lists newest first and says when a subject has not synced yet", async () => {
    await renderApp({
      seed: (s) => {
        s.principal("PRINCIPAL-A");
        s.run(writeLogRows, { principal: idFor(s, "PRINCIPAL-A"), count: 3, area: "calendar", event: "event-not-here" });
      },
      children: <LogScreen />,
    });
    await chooseArea("Calendar");
    expect(column(7)).toEqual(["Row 2", "Row 1", "Row 0"]);
    expect(column(4)).toEqual(["not synced yet", "not synced yet", "not synced yet"]);
  });

  test("clicking an event row opens the engagement panel, a task row the task panel", async () => {
    const app = await renderApp({ seed: seedTwo, children: <><LogScreen /><AppProbe /></> });
    const a = idFor(app.seed, "PRINCIPAL-A");
    const task = rows(app.device, "tasks").find((t) => t.title === "Draft speech")!;
    fireEvent.click(screen.getByRole("button", { name: "Budget meeting" }));
    expect(JSON.parse(probe().panel)).toEqual({ kind: "engagement", id: idOf(app.device, "event", a, "m1") });
    fireEvent.click(bodyRows().find((r) => r.textContent?.includes("Draft speech"))!);
    expect(JSON.parse(probe().panel)).toEqual({ kind: "task", id: task.id });
  });

  test("shows 200 rows, then 200 more with Show more", async () => {
    await renderApp({
      seed: (s) => {
        s.principal("PRINCIPAL-A");
        s.run(writeLogRows, { principal: idFor(s, "PRINCIPAL-A"), count: 450 });
      },
      children: <LogScreen />,
    });
    expect(bodyRows()).toHaveLength(200);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(bodyRows()).toHaveLength(400);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(bodyRows()).toHaveLength(451); // 450 written, plus the principal-added row
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  test("says no entries for this filter when the area matches nothing", async () => {
    await renderApp({ seed: (s) => s.principal("PRINCIPAL-A"), children: <LogScreen /> });
    await chooseArea("Overlay");
    expect(screen.getByRole("heading", { name: "No entries for this filter" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Nothing logged yet." })).toBeNull();
  });

  test("says nothing is logged yet when the principal has no rows at all", async () => {
    await renderApp({ seed: (s) => s.run(putPrincipal, { code: "PRINCIPAL-A" }), children: <LogScreen /> });
    expect(screen.getByRole("heading", { name: "Nothing logged yet." })).toBeTruthy();
  });

  test("shows who by name, and a task move's sections, a link's event and an assignee by name", async () => {
    await renderApp({
      seed: (s) => {
        s.user("user-a", "Alex Example");
        s.user("user-b", "Blair Sample");
        s.principal("PRINCIPAL-A");
        const a = idFor(s, "PRINCIPAL-A");
        s.run(importApply, { now: NOW, principal: a, file: "a.ics", diff: DIFF });
        const project = s.run(projectSave, { now: NOW, name: "Office work" });
        const section = s.run(sectionSave, { now: NOW, project, name: "Speeches" });
        const task = s.task({ title: "Draft speech", principal: a, project });
        s.run(taskMove, { now: NOW, id: task, section });
        s.run(taskLink, { now: NOW, id: task, event: idOf(s.device, "event", a, "m1") });
        s.run(taskAssign, { now: NOW, id: task, action: "assign", assignee: "user-b" });
      },
      children: <LogScreen />,
    });
    await chooseArea("Task");
    const cells = bodyRows().map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(cells.every((c) => c[1] === "Alex Example")).toBe(true);
    const of = (what: string) => cells.find((c) => c[3] === what)!;
    expect(of("Moved").slice(5, 7)).toEqual(["", "Speeches"]);
    expect(of("Linked")[6]).toBe("Budget meeting");
    expect(of("Assigned")[6]).toBe("Blair Sample");
    expect(screen.queryByText(/user-/)).toBeNull();
  });
});
