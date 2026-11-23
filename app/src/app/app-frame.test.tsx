// The frame: navigation, the principal switch, the Needs action count, viewer
// mode, the no-principals empty state, and the Q shortcut.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { principalSave, projectSave } from "../domain/commands";
import { AppFrame } from "./app-frame";
import { AppProbe, cleanupApp, NOW, probe, renderApp } from "./testing/render-app";

afterEach(cleanupApp);

const nav = () => screen.getByRole("navigation", { name: "Main" });
const navItem = (name: string) => within(nav()).getByRole("button", { name });
const heading = (name: string) => screen.getByRole("heading", { name });

test("navigating from the sidebar changes the screen and marks the item active", async () => {
  await renderApp({ seed: (s) => { s.principal("PRINCIPAL-A"); s.ackPrivacy(); }, children: <><AppFrame /><AppProbe /></> });
  expect(heading("Calendar")).toBeTruthy();
  expect(navItem("Calendar").getAttribute("aria-current")).toBe("page");

  fireEvent.click(navItem("Log"));
  expect(heading("Log")).toBeTruthy();
  expect(navItem("Log").getAttribute("aria-current")).toBe("page");
  expect(navItem("Calendar").getAttribute("aria-current")).toBeNull();

  fireEvent.click(navItem("Inbox"));
  expect(probe().screen).toBe("inbox");
  expect(heading("Inbox")).toBeTruthy();
});

test("the shared project appears under Tasks by name", async () => {
  await renderApp({
    seed: (s) => {
      s.principal("PRINCIPAL-A");
      s.run(projectSave, { now: NOW, name: "Office work" });
    },
  });
  expect(navItem("Office work")).toBeTruthy();
});

test("with no shared project yet, Tasks still lists Project, which offers to create it", async () => {
  await renderApp({ seed: (s) => { s.principal("PRINCIPAL-A"); s.ackPrivacy(); } });
  fireEvent.click(navItem("Project"));
  expect(screen.getByRole("button", { name: "Create the shared project" })).toBeTruthy();
});

test("the principal switch changes the chosen principal", async () => {
  let b = "";
  await renderApp({
    seed: (s) => {
      s.principal("PRINCIPAL-A", { order: 1 });
      b = s.principal("PRINCIPAL-B", { order: 2 });
    },
    children: <><AppFrame /><AppProbe /></>,
  });
  const switcher = screen.getByRole("group", { name: "Principal" });
  expect(within(switcher).getByRole("button", { name: "PRINCIPAL-A" }).getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(within(switcher).getByRole("button", { name: "PRINCIPAL-B" }));

  expect(probe().principalId).toBe(b);
  expect(within(nav()).getByText("PRINCIPAL-B")).toBeTruthy();
});

test("with one principal there is no switch, but the group is labelled with its code", async () => {
  await renderApp({ seed: (s) => s.principal("PRINCIPAL-A") });
  expect(screen.queryByRole("group", { name: "Principal" })).toBeNull();
  expect(within(nav()).getByText("PRINCIPAL-A")).toBeTruthy();
});

test("when the chosen principal is made inactive the choice falls back to the first active one", async () => {
  let b = "";
  let a = "";
  const app = await renderApp({
    seed: (s) => {
      a = s.principal("PRINCIPAL-A", { order: 1 });
      b = s.principal("PRINCIPAL-B", { order: 2 });
    },
    children: <><AppFrame /><AppProbe /></>,
  });
  fireEvent.click(screen.getByRole("button", { name: "PRINCIPAL-B" }));
  expect(probe().principalId).toBe(b);

  app.seed.run(principalSave, { now: NOW, id: b, active: false });

  expect(probe().principalId).toBe(a);
});

test("Needs action shows the count for the chosen principal and opens the panel", async () => {
  await renderApp({
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A", { order: 1 });
      const b = s.principal("PRINCIPAL-B", { order: 2 });
      s.task({ title: "Overdue for A", principal: a, due: "2026-11-20" });
      s.task({ title: "Due today for A", principal: a, due: "2026-11-22" });
      s.task({ title: "Later for A", principal: a, due: "2026-12-01" });
      s.task({ title: "Overdue for B", principal: b, due: "2026-11-20" });
    },
    children: <><AppFrame /><AppProbe /></>,
  });
  const button = screen.getByRole("button", { name: "Needs action 2" });
  // The name is the visible text (WCAG 2.5.3, label in name), not a separate aria-label.
  expect(button.getAttribute("aria-label")).toBeNull();
  expect(button.textContent).toBe("Needs action 2");

  fireEvent.click(button);

  expect(probe().panel).toBe(JSON.stringify({ kind: "needs-action" }));
  expect(await screen.findByRole("heading", { name: "Needs action" })).toBeTruthy();
});

test("a viewer sees no Add task button and a read-only line, and Q does nothing", async () => {
  await renderApp({ seed: (s) => { s.principal("PRINCIPAL-A"); s.viewer(); }, children: <><AppFrame /><AppProbe /></> });
  expect(screen.queryByRole("button", { name: "Add task" })).toBeNull();
  expect(screen.getByText("Read-only view")).toBeTruthy();

  fireEvent.keyDown(document.body, { key: "q" });

  expect(probe().quickAddOpen).toBe(false);
});

test("an assistant sees Add task, which opens quick add", async () => {
  await renderApp({ seed: (s) => s.principal("PRINCIPAL-A") });
  expect(screen.queryByText("Read-only view")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Add task" }));

  expect(await screen.findByRole("heading", { name: "Quick add" })).toBeTruthy();
});

test("with no principals the principal screens point to the admin page and task screens still work", async () => {
  await renderApp({ seed: (s) => { s.ackPrivacy(); } });
  expect(screen.getByText("No principals yet")).toBeTruthy();
  expect(screen.getByText("Add them in the admin page.")).toBeTruthy();

  fireEvent.click(navItem("Import"));
  expect(screen.getByText("No principals yet")).toBeTruthy();

  fireEvent.click(navItem("Today"));
  expect(heading("Today")).toBeTruthy();
  expect(screen.queryByText("No principals yet")).toBeNull();
});

test("Add task is the primary button only on the task screens", async () => {
  await renderApp({ seed: (s) => { s.principal("PRINCIPAL-A"); s.ackPrivacy(); s.run(projectSave, { now: NOW, name: "Office work" }); } });
  const addTask = () => screen.getByRole("button", { name: "Add task" });
  const isPrimary = () => addTask().className.includes("bg-primary text-primary-foreground");
  for (const item of ["Calendar", "Import", "Log"]) {
    fireEvent.click(navItem(item));
    expect(isPrimary(), item).toBe(false);
    expect(addTask().className, item).toContain("border-border");
  }
  for (const item of ["Inbox", "Today", "Office work", "Bin"]) {
    fireEvent.click(navItem(item));
    expect(isPrimary(), item).toBe(true);
  }
});

test("the signed-in user's name shows in the top bar", async () => {
  await renderApp({ name: "Synthetic User" });
  expect(screen.getByText("Synthetic User")).toBeTruthy();
});

test("the top bar prefers the user's name in the users table", async () => {
  await renderApp({ name: "Session Name", seed: (s) => s.user("user-a", "Alex Example") });
  expect(screen.getByText("Alex Example")).toBeTruthy();
  expect(screen.queryByText("Session Name")).toBeNull();
});

test("pressing Q opens quick add, but not while typing in an input", async () => {
  await renderApp({ seed: (s) => s.principal("PRINCIPAL-A"), children: <><AppFrame /><input aria-label="Scratch" /><AppProbe /></> });
  const input = screen.getByLabelText("Scratch");
  input.focus();

  fireEvent.keyDown(input, { key: "q" });
  expect(probe().quickAddOpen).toBe(false);

  fireEvent.keyDown(document.body, { key: "q" });
  expect(probe().quickAddOpen).toBe(true);
  expect(await screen.findByRole("heading", { name: "Quick add" })).toBeTruthy();
});
