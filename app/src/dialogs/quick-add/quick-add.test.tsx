// Quick add: the preview, resolving names, ignoring unknown ones, adding and closing.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { AppFrame } from "@/app/app-frame";
import { AppProbe, cleanupApp, NOW, probe, renderApp, type RenderedApp } from "@/app/testing/render-app";
import { projectSave, sectionSave } from "@/domain/commands";
import { rows } from "@/domain/commands/testing/world";
import { resolveQuickAdd } from "./resolve";

afterEach(cleanupApp);

interface Ids {
  principal: string;
  project: string;
  section: string;
}

async function openQuickAdd(): Promise<{ app: RenderedApp; ids: Ids }> {
  const ids: Ids = { principal: "", project: "", section: "" };
  const app = await renderApp({
    seed: (s) => {
      ids.principal = s.principal("PRINCIPAL-A");
      ids.project = s.run(projectSave, { now: NOW, name: "Office work" });
      ids.section = s.run(sectionSave, { now: NOW, project: ids.project, name: "Letters" });
      s.task({ title: "Earlier", assignee: "user-b" });
    },
    children: <><AppFrame /><AppProbe /></>,
  });
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
  await screen.findByRole("heading", { name: "Quick add" });
  return { app, ids };
}

const input = () => screen.getByLabelText("Task");
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const preview = () => screen.getByRole("group", { name: "Understood as" });
const chip = (kind: string) => within(preview()).getByTestId(`chip-${kind}`).textContent;
const tasksTitled = (app: RenderedApp, title: string) => rows(app.device, "tasks").filter((t) => t.title === title);

test("the input is focused when quick add opens", async () => {
  await openQuickAdd();
  expect(document.activeElement).toBe(input());
});

test("the preview shows the title and a chip for each part, with names resolved", async () => {
  await openQuickAdd();
  type("Ring back #office work /letters p1 +User-B ^principal-a tomorrow {fri}");
  expect(screen.getByTestId("preview-title").textContent).toBe("Ring back");
  expect(chip("project")).toContain("Office work");
  expect(chip("section")).toContain("Letters");
  expect(chip("priority")).toContain("P1");
  expect(chip("person")).toContain("user-b");
  expect(chip("principal")).toContain("PRINCIPAL-A");
  expect(chip("due")).toContain("Mon 23 Nov");
  expect(chip("deadline")).toContain("Deadline Fri 27 Nov");
});

test("only the parts present get a chip", async () => {
  await openQuickAdd();
  type("Ring back p2");
  expect(within(preview()).getAllByTestId(/^chip-/)).toHaveLength(1);
});

test("Enter adds the resolved task, clears the input and closes the dialog", async () => {
  const { app, ids } = await openQuickAdd();
  type("Ring back #office work /letters p1 ^PRINCIPAL-A tomorrow {fri}");
  fireEvent.submit(input());
  expect(tasksTitled(app, "Ring back")[0]).toMatchObject({ project: ids.project, section: ids.section, priority: 1, principal: ids.principal, due: "2026-11-23", deadline: "2026-11-27" });
  expect(probe().quickAddOpen).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
  expect((await screen.findByLabelText("Task")).getAttribute("value") ?? "").toBe("");
});

test("an unresolved name is struck through, marked not found, and ignored on add", async () => {
  const { app } = await openQuickAdd();
  type("Ring back #nowhere ^PRINCIPAL-Z");
  expect(chip("project")).toBe("nowhere not found (Project)");
  expect(within(preview()).getByText("nowhere").tagName).toBe("S");
  expect(chip("principal")).toContain("not found");
  fireEvent.submit(input());
  const [added] = tasksTitled(app, "Ring back");
  const inbox = rows(app.device, "projects").find((p) => p.inbox === true && p.owner === "user-a");
  expect(added).toMatchObject({ project: inbox?.id, principal: "" });
});

test("Enter with an empty title does nothing", async () => {
  const { app } = await openQuickAdd();
  const before = rows(app.device, "tasks").length;
  type("p1 tomorrow");
  fireEvent.submit(input());
  expect(rows(app.device, "tasks")).toHaveLength(before);
  expect(probe().quickAddOpen).toBe(true);
});

test("an unknown person is kept as typed", () => {
  const { input: result, chips } = resolveQuickAdd(
    { title: "Call", assignee: "user-z" },
    { shared: undefined, inbox: undefined, sections: [], principals: [], users: ["user-a"] },
  );
  expect(result.assignee).toBe("user-z");
  expect(chips).toEqual([{ kind: "person", label: "user-z", found: true }]);
});
