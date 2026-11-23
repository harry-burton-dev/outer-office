// The task panel: editing each field, completing, the bin, history, viewer mode, a task not synced yet.
import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { Sheet } from "@/components/ui/sheet";
import { AppProbe, cleanupApp, NOW, probe, renderApp, type RenderedApp, type Seeder } from "@/app/testing/render-app";
import { projectSave, sectionSave, taskLink, taskUpdate } from "@/domain/commands";
import { byId } from "@/domain/commands/testing/world";
import { TaskPanel } from "../task-panel";

afterEach(cleanupApp);

interface Seeded {
  id: string;
  principal: string;
  project: string;
  section: string;
}

function seedTask(s: Seeder): Seeded {
  const principal = s.principal("PRINCIPAL-A");
  const project = s.run(projectSave, { now: NOW, name: "Office work" });
  const section = s.run(sectionSave, { now: NOW, project, name: "Letters" });
  const id = s.task({ title: "Draft reply", notes: "Short", due: "2026-11-24" });
  return { id, principal, project, section };
}

/** Reads the id at render time, which comes after seeding. */
function PanelFor({ id }: { id: () => string }) {
  return <TaskPanel taskId={id()} />;
}

async function openPanel(viewer = false): Promise<{ app: RenderedApp; seeded: Seeded }> {
  let seeded: Seeded = { id: "", principal: "", project: "", section: "" };
  const app = await renderApp({
    seed: (s) => {
      seeded = seedTask(s);
      if (viewer) s.viewer();
    },
    children: <><Sheet open><PanelFor id={() => seeded.id} /></Sheet><AppProbe /></>,
  });
  return { app, seeded };
}

const task = (app: RenderedApp, id: string) => byId(app.device, "tasks", id);

test("the title saves on blur", async () => {
  const { app, seeded } = await openPanel();
  const title = screen.getByLabelText("Title");
  fireEvent.change(title, { target: { value: "Draft the reply" } });
  fireEvent.blur(title);
  expect(task(app, seeded.id)?.title).toBe("Draft the reply");
});

test("blurring a field without a change does not run task.update", async () => {
  const { app } = await openPanel();
  const run = vi.spyOn(app.device.data, "run");
  fireEvent.blur(screen.getByLabelText("Title"));
  fireEvent.blur(screen.getByLabelText("Notes"));
  fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "4" } });
  expect(run.mock.calls.filter(([command]) => command === taskUpdate)).toHaveLength(0);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("notes, dates, priority, principal, project and section each save through task.update", async () => {
  const { app, seeded } = await openPanel();
  fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Longer notes" } });
  fireEvent.blur(screen.getByLabelText("Notes"));
  fireEvent.change(screen.getByLabelText("Due"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Deadline"), { target: { value: "2026-11-30" } });
  fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Principal"), { target: { value: seeded.principal } });
  fireEvent.change(screen.getByLabelText("Project"), { target: { value: seeded.project } });
  fireEvent.change(screen.getByLabelText("Section"), { target: { value: seeded.section } });
  const saved = task(app, seeded.id);
  expect(saved).toMatchObject({ notes: "Longer notes", due: "", deadline: "2026-11-30", priority: 1, principal: seeded.principal, project: seeded.project, section: seeded.section });
  fireEvent.change(screen.getByLabelText("Principal"), { target: { value: "" } });
  expect(task(app, seeded.id)?.principal).toBe("");
});

test("Complete is the one primary button and toggles to Reopen", async () => {
  const { app, seeded } = await openPanel();
  fireEvent.click(screen.getByRole("button", { name: "Complete" }));
  expect(task(app, seeded.id)?.done).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
  expect(task(app, seeded.id)?.done).toBe(false);
});

test("Move to bin removes the task", async () => {
  const { app, seeded } = await openPanel();
  fireEvent.click(screen.getByRole("button", { name: "Move to bin" }));
  expect(task(app, seeded.id)?._deleted).toBe(true);
  expect(probe().panel).toBe("");
  expect(screen.getByText("This task is in the bin.")).toBeTruthy();
});

test("history lists the task's log rows newest first", async () => {
  const { app, seeded } = await openPanel();
  app.seed.run(taskUpdate, { now: "2026-11-22T10:00:00.000Z", id: seeded.id, title: "Renamed" });
  const rows = screen.getAllByTestId("history-row").map((r) => r.textContent ?? "");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toContain("Changed: title");
  expect(rows[0]).toContain("Draft reply → Renamed");
  expect(rows[0]).toContain("Sun 22 Nov 10:00");
  expect(rows[1]).toContain("created");
});

test("a linked engagement that has not arrived says so and can be unlinked", async () => {
  const { app, seeded } = await openPanel();
  const engagement = () => screen.getByRole("region", { name: "Engagement" });
  expect(within(engagement()).getByText("None")).toBeTruthy();
  app.seed.run(taskLink, { now: NOW, id: seeded.id, event: "event-not-here" });
  expect(within(engagement()).getByText("Not synced yet")).toBeTruthy();
  fireEvent.click(within(engagement()).getByRole("button", { name: "Unlink" }));
  expect(task(app, seeded.id)?.event).toBe("");
});

test("a task that has not synced yet shows a placeholder", async () => {
  await renderApp({ children: <Sheet open><TaskPanel taskId="missing-task" /></Sheet> });
  expect(screen.getByText("This task has not synced yet.")).toBeTruthy();
});

test("a viewer sees the task with no write controls", async () => {
  await openPanel(true);
  expect(screen.getByRole("heading", { name: "Draft reply" })).toBeTruthy();
  expect(screen.queryByLabelText("Title")).toBeNull();
  expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  const buttons = screen.queryAllByRole("button").map((b) => b.textContent);
  expect(buttons).toEqual(["Close"]);
  expect(screen.getByText("Tue 24 Nov")).toBeTruthy();
});
