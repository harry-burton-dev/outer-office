// The assignment block follows the brief's state table for assigner and assignee.
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
  expect(within(block()).getByText("Offered to user-b by user-a")).toBeTruthy();
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
  expect(within(block()).getByText("Offered to user-a by user-b")).toBeTruthy();
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
  expect(within(block()).getByText("Declined by user-b, assigned by user-a")).toBeTruthy();
  expect(actions()).toEqual(["Reassign", "Clear"]);
  assignTo("user-c", "Reassign");
  expect(state(app)).toEqual({ assignment: "offered", assignee: "user-c" });
});

test("declined, as assigner: Clear leads to none", async () => {
  const app = await panelWith({ assignment: "declined", assignee: "user-b", assignedBy: "user-a" });
  click("Clear");
  expect(state(app)).toEqual({ assignment: "none", assignee: "" });
});

test("someone else's assignment offers this user nothing", async () => {
  await panelWith({ assignment: "offered", assignee: "user-b", assignedBy: "user-c" });
  expect(actions()).toEqual([]);
  await cleanupApp();
  await panelWith({ assignment: "declined", assignee: "user-a", assignedBy: "user-b" });
  expect(actions()).toEqual([]);
});
