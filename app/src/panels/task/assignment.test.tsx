// The assignment block follows the brief's state table for assigner and assignee,
// names people from the users table, and offers only active ones to assign.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { Sheet } from "@/components/ui/sheet";
import { cleanupApp, renderApp, type RenderedApp } from "@/app/testing/render-app";
import { byId } from "@/domain/commands/testing/world";
import { putTask } from "@/screens/tasks/testing/seed";
import { TaskPanel } from "../task-panel";

afterEach(cleanupApp);

interface AssignFields {
  assignment: "none" | "offered" | "accepted" | "declined";
  assignee: string;
  assignedBy: string;
}

const TASK_ID = "task-assign-1";

async function panelWith(fields: AssignFields): Promise<RenderedApp> {
  return renderApp({
    seed: (s) => {
      s.user("user-a", "Alex Example");
      s.user("user-b", "Blair Sample");
      s.user("user-c", "Casey Test");
      s.user("user-d", "Dana Gone", false);
      const inbox = s.task({ title: "Seed inbox" });
      const project = byId(s.device, "tasks", inbox)?.project ?? "";
      s.run(putTask, { id: TASK_ID, fields: { title: "Shared job", project, createdBy: "user-a", done: false, order: 5, ...fields } });
    },
    children: <Sheet open><TaskPanel taskId={TASK_ID} /></Sheet>,
  });
}

const block = () => screen.getByRole("region", { name: "Assignment" });
const actions = () => within(block()).queryAllByRole("button").map((b) => b.textContent);
const state = (app: RenderedApp) => {
  const t = byId(app.device, "tasks", TASK_ID);
  return { assignment: t?.assignment, assignee: t?.assignee };
};
const click = (name: string) => fireEvent.click(within(block()).getByRole("button", { name }));

function assignTo(person: string, label = "Assign") {
  fireEvent.change(within(block()).getByLabelText("Person"), { target: { value: person } });
  click(label);
}

test("unassigned: Assign to someone offers it", async () => {
  const app = await panelWith({ assignment: "none", assignee: "", assignedBy: "" });
  expect(within(block()).getByText("Not assigned")).toBeTruthy();
  expect(actions()).toEqual(["Assign"]);
  assignTo("user-b");
  expect(state(app)).toEqual({ assignment: "offered", assignee: "user-b" });
  expect(within(block()).getByText("Offered to Blair Sample by Alex Example")).toBeTruthy();
});

test("unassigned: Assign to yourself accepts it", async () => {
  const app = await panelWith({ assignment: "none", assignee: "", assignedBy: "" });
  assignTo("user-a");
  expect(state(app)).toEqual({ assignment: "accepted", assignee: "user-a" });
});

test("offered, as assigner: only Recall, which clears it", async () => {
  const app = await panelWith({ assignment: "offered", assignee: "user-b", assignedBy: "user-a" });
  expect(actions()).toEqual(["Recall"]);
  click("Recall");
  expect(state(app)).toEqual({ assignment: "none", assignee: "" });
});

test("offered, as assignee: Accept leads to accepted", async () => {
  const app = await panelWith({ assignment: "offered", assignee: "user-a", assignedBy: "user-b" });
  expect(within(block()).getByText("Offered to Alex Example by Blair Sample")).toBeTruthy();
  expect(actions()).toEqual(["Accept", "Decline"]);
  click("Accept");
  expect(state(app).assignment).toBe("accepted");
});

test("offered, as assignee: Decline leads to declined", async () => {
  const app = await panelWith({ assignment: "offered", assignee: "user-a", assignedBy: "user-b" });
  click("Decline");
  expect(state(app).assignment).toBe("declined");
});

test("accepted, as assignee: Hand back leads to declined", async () => {
  const app = await panelWith({ assignment: "accepted", assignee: "user-a", assignedBy: "user-b" });
  expect(actions()).toEqual(["Hand back"]);
  click("Hand back");
  expect(state(app).assignment).toBe("declined");
});

test("accepted, as assigner: Recall leads to none", async () => {
  const app = await panelWith({ assignment: "accepted", assignee: "user-b", assignedBy: "user-a" });
  expect(actions()).toEqual(["Recall"]);
  click("Recall");
  expect(state(app)).toEqual({ assignment: "none", assignee: "" });
});

test("declined, as assigner: Reassign offers it again and Clear clears it", async () => {
  const app = await panelWith({ assignment: "declined", assignee: "user-b", assignedBy: "user-a" });
  expect(within(block()).getByText("Declined by Blair Sample, assigned by Alex Example")).toBeTruthy();
  expect(actions()).toEqual(["Reassign", "Clear"]);
  assignTo("user-c", "Reassign");
  expect(state(app)).toEqual({ assignment: "offered", assignee: "user-c" });
});

test("declined, as assigner: Clear leads to none", async () => {
  const app = await panelWith({ assignment: "declined", assignee: "user-b", assignedBy: "user-a" });
  click("Clear");
  expect(state(app)).toEqual({ assignment: "none", assignee: "" });
});

test("the person picker is a select of active people by name, storing the id", async () => {
  await panelWith({ assignment: "none", assignee: "", assignedBy: "" });
  const picker = within(block()).getByLabelText("Person") as HTMLSelectElement;
  expect(picker.tagName).toBe("SELECT");
  expect([...picker.options].map((o) => [o.value, o.textContent])).toEqual([
    ["", "Choose a person"],
    ["user-a", "Alex Example"],
    ["user-b", "Blair Sample"],
    ["user-c", "Casey Test"],
  ]);
  expect((within(block()).getByRole("button", { name: "Assign" }) as HTMLButtonElement).disabled).toBe(true);
});

test("someone else's assignment offers this user nothing", async () => {
  await panelWith({ assignment: "offered", assignee: "user-b", assignedBy: "user-c" });
  expect(actions()).toEqual([]);
  await cleanupApp();
  await panelWith({ assignment: "declined", assignee: "user-a", assignedBy: "user-b" });
  expect(actions()).toEqual([]);
});
