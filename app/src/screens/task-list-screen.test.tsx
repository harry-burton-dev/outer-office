// The task lists: which tasks each shows, the row, completing, moving, the bin, viewer mode.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { projectSave, sectionSave, taskComplete, taskRemove } from "@/domain/commands";
import { AppFrame } from "@/app/app-frame";
import { AppProbe, cleanupApp, NOW, probe, renderApp, type Seeder } from "@/app/testing/render-app";
import { byId } from "@/domain/commands/testing/world";
import { TaskListScreen } from "./task-list-screen";
import { putInbox, putTask } from "./tasks/testing/seed";

afterEach(cleanupApp);

const rowTitles = () => screen.queryAllByTestId("task-row").map((row) => within(row).getAllByRole("button").find((b) => b.getAttribute("role") !== "checkbox")?.textContent ?? "");
const titlesIn = (name: string) => within(screen.getByRole("region", { name })).getAllByTestId("task-row").map((row) => row.textContent ?? "");

function otherUsersInboxTask(s: Seeder, title: string): string {
  const inbox = s.run(putInbox, { userId: "user-b" });
  return s.run(putTask, { fields: { title, project: inbox, createdBy: "user-b", done: false, order: 1, assignment: "none", assignee: "" } });
}

test("the inbox shows my inbox tasks and not another user's", async () => {
  await renderApp({
    seed: (s) => {
      s.task({ title: "Mine" });
      otherUsersInboxTask(s, "Theirs");
      s.run(projectSave, { now: NOW, name: "Office work" });
    },
    children: <TaskListScreen list="inbox" />,
  });
  expect(screen.getByRole("heading", { name: "Inbox" })).toBeTruthy();
  expect(rowTitles()).toEqual(["Mine"]);
});

test("today groups overdue first, then today, and leaves out later and other people's tasks", async () => {
  await renderApp({
    seed: (s) => {
      s.task({ title: "Later", due: "2026-12-01" });
      s.task({ title: "Due now", due: "2026-11-22" });
      s.task({ title: "Late", due: "2026-11-20" });
      s.task({ title: "Offered away", due: "2026-11-22", assignee: "user-b" });
    },
    children: <TaskListScreen list="today" />,
  });
  expect(titlesIn("Overdue")[0]).toContain("Late");
  expect(titlesIn("Today")).toHaveLength(1);
  expect(titlesIn("Today")[0]).toContain("Due now");
  expect(screen.queryByText("Later")).toBeNull();
  expect(screen.queryByText("Offered away")).toBeNull();
});

test("an overdue date is shown in the destructive colour with the word overdue", async () => {
  await renderApp({ seed: (s) => void s.task({ title: "Late", due: "2026-11-20" }), children: <TaskListScreen list="inbox" /> });
  const date = screen.getByText(/overdue/);
  expect(date.textContent).toBe("Fri 20 Nov, overdue");
  expect(date.className).toContain("text-destructive");
});

test("a row shows at most three metadata items: date, assignee, principal", async () => {
  await renderApp({
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A");
      s.task({ title: "Busy", due: "2026-11-24", deadline: "2026-11-25", assignee: "user-b", principal: a, priority: 1 });
    },
    children: <TaskListScreen list="inbox" />,
  });
  const meta = screen.getByTestId("row-meta");
  expect(meta.children).toHaveLength(3);
  expect(meta.textContent).toBe("Tue 24 Novuser-bPRINCIPAL-A");
});

test("ticking the checkbox completes the task and it drops out of the list", async () => {
  let id = "";
  const app = await renderApp({ seed: (s) => void (id = s.task({ title: "Tick me" })), children: <TaskListScreen list="inbox" /> });
  fireEvent.click(screen.getByRole("checkbox", { name: "Complete Tick me" }));
  expect(byId(app.device, "tasks", id)?.done).toBe(true);
  expect(screen.queryByText("Tick me")).toBeNull();
  expect(screen.getByText("Your Inbox is empty")).toBeTruthy();
});

test("clicking a row opens the task panel", async () => {
  let id = "";
  await renderApp({ seed: (s) => void (id = s.task({ title: "Open me" })), children: <><TaskListScreen list="inbox" /><AppProbe /></> });
  fireEvent.click(screen.getByText("Open me"));
  expect(probe().panel).toBe(JSON.stringify({ kind: "task", id }));
});

test("switching principal does not change any task list", async () => {
  await renderApp({
    seed: (s) => {
      s.ackPrivacy();
      const a = s.principal("PRINCIPAL-A", { order: 1 });
      s.principal("PRINCIPAL-B", { order: 2 });
      s.task({ title: "Tagged A", principal: a, due: "2026-11-22" });
      s.task({ title: "Untagged", due: "2026-11-22" });
    },
    children: <AppFrame />,
  });
  const nav = screen.getByRole("navigation", { name: "Main" });
  for (const list of ["Inbox", "Today"]) {
    fireEvent.click(within(nav).getByRole("button", { name: list }));
    const before = rowTitles();
    fireEvent.click(screen.getByRole("button", { name: "PRINCIPAL-B" }));
    expect(rowTitles()).toEqual(before);
    expect(before).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "PRINCIPAL-A" }));
  }
});

function seedProject(s: Seeder): { project: string; section: string } {
  const project = s.run(projectSave, { now: NOW, name: "Office work" });
  const section = s.run(sectionSave, { now: NOW, project, name: "Letters" });
  s.task({ title: "Loose", project });
  s.task({ title: "First", project, section });
  s.task({ title: "Second", project, section });
  s.task({ title: "Third", project, section });
  return { project, section };
}

test("the project list groups by section, loose tasks first", async () => {
  await renderApp({ seed: (s) => void seedProject(s), children: <TaskListScreen list="project" /> });
  expect(screen.getByRole("heading", { name: "Office work" })).toBeTruthy();
  expect(rowTitles()).toEqual(["Loose", "First", "Second", "Third"]);
  expect(titlesIn("Letters")).toEqual(["First", "Second", "Third"]);
});

test("moving a task down puts it after its neighbour", async () => {
  await renderApp({ seed: (s) => void seedProject(s), children: <TaskListScreen list="project" /> });
  fireEvent.click(screen.getByRole("button", { name: "Move First down" }));
  expect(titlesIn("Letters")).toEqual(["Second", "First", "Third"]);
  fireEvent.click(screen.getByRole("button", { name: "Move Third up" }));
  expect(titlesIn("Letters")).toEqual(["Second", "Third", "First"]);
});

test("add section saves a section from the inline field", async () => {
  await renderApp({ seed: (s) => void seedProject(s), children: <TaskListScreen list="project" /> });
  fireEvent.click(screen.getByRole("button", { name: "Add section" }));
  const input = screen.getByLabelText("Section name");
  fireEvent.change(input, { target: { value: "Calls" } });
  fireEvent.submit(input);
  expect(screen.getByRole("heading", { name: "Calls" })).toBeTruthy();
});

test("show completed brings completed project tasks back", async () => {
  await renderApp({
    seed: (s) => {
      const { project } = seedProject(s);
      const done = s.task({ title: "Finished", project });
      s.run(taskComplete, { now: NOW, id: done, done: true });
    },
    children: <TaskListScreen list="project" />,
  });
  expect(screen.queryByText("Finished")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show completed" }));
  expect(screen.getByText("Finished")).toBeTruthy();
});

test("with no shared project there is one action that creates it", async () => {
  await renderApp({ children: <TaskListScreen list="project" /> });
  fireEvent.click(screen.getByRole("button", { name: "Create the shared project" }));
  expect(screen.getByRole("heading", { name: "Office work" })).toBeTruthy();
});

test("the bin lists my removed tasks and restores one", async () => {
  await renderApp({
    seed: (s) => {
      const id = s.task({ title: "Binned" });
      s.task({ title: "Kept" });
      s.run(taskRemove, { now: NOW, id });
      const theirs = otherUsersInboxTask(s, "Their binned");
      s.run(taskRemove, { now: NOW, id: theirs });
    },
    children: <TaskListScreen list="bin" />,
  });
  expect(rowTitles()).toEqual(["Binned"]);
  fireEvent.click(screen.getByRole("button", { name: "Restore Binned" }));
  expect(screen.getByText("The bin is empty")).toBeTruthy();
});

test("each list has a one-line empty state", async () => {
  for (const [list, text] of [["inbox", "Your Inbox is empty"], ["today", "Nothing due today"], ["bin", "The bin is empty"]] as const) {
    await renderApp({ children: <TaskListScreen list={list} /> });
    expect(screen.getByText(text)).toBeTruthy();
    cleanupApp();
  }
  await renderApp({ seed: (s) => void s.run(projectSave, { now: NOW, name: "Office work" }), children: <TaskListScreen list="project" /> });
  expect(screen.getByText("No tasks in this project yet")).toBeTruthy();
});

test("a viewer sees no write controls on the lists", async () => {
  await renderApp({
    seed: (s) => {
      s.viewer();
      seedProject(s);
    },
    children: <TaskListScreen list="project" />,
  });
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Add section" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
  cleanupApp();
  await renderApp({ seed: (s) => s.viewer(), children: <TaskListScreen list="project" /> });
  expect(screen.queryByRole("button", { name: "Create the shared project" })).toBeNull();
});
