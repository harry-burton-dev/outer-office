// task.assign: the assignment state table of the brief.
//   none     -> assign to someone: offered; assign to yourself: accepted
//   offered  -> assignee accepts: accepted; assignee declines: declined; assigner recalls: none
//   accepted -> assignee hands back: declined; assigner recalls: none
//   declined -> assigner reassigns: offered; assigner clears: none
import { defineCommand, type Tx } from "@trellis/framework";
import { requireNow } from "./shared";
import { loadTask, logTask, type Assignment, type Task } from "./task-common";

export type AssignAction = "assign" | "accept" | "decline" | "recall" | "clear";

export interface TaskAssignInput {
  now: string;
  id: string;
  action: AssignAction;
  /** The user id to assign to; needed for "assign". */
  assignee?: string;
}

interface Outcome {
  readonly fields: { assignee?: string; assignedBy?: string; assignment: Assignment };
  readonly kind: "assigned" | "accepted" | "declined" | "recalled";
}

const stateOf = (task: Task): Assignment => {
  const state = task.assignment;
  return state === "offered" || state === "accepted" || state === "declined" ? state : "none";
};

const ACTION_NAMES: Record<AssignAction, string> = {
  assign: "assigned", accept: "accepted", decline: "declined", recall: "recalled", clear: "cleared",
};

const ALLOWED: Record<Assignment, readonly AssignAction[]> = {
  none: ["assign"],
  offered: ["accept", "decline", "recall"],
  accepted: ["decline", "recall"],
  declined: ["assign", "clear"],
};

function requireAssignee(tx: Tx, input: TaskAssignInput): string {
  if (typeof input.assignee !== "string" || input.assignee.trim() === "") tx.fail("Say who the task is for.");
  return input.assignee.trim();
}

function checkActor(tx: Tx, task: Task, state: Assignment, action: AssignAction): void {
  if ((action === "accept" || action === "decline") && task.assignee !== tx.user) tx.fail("Only the person the task is assigned to can do that.");
  const assignerOnly = action === "recall" || action === "clear" || (action === "assign" && state === "declined");
  if (assignerOnly && task.assignedBy !== tx.user) tx.fail("Only the person who assigned the task can do that.");
}

function outcome(tx: Tx, task: Task, state: Assignment, input: TaskAssignInput): Outcome {
  switch (input.action) {
    case "assign": {
      const assignee = requireAssignee(tx, input);
      if (state === "declined" && assignee === tx.user) tx.fail("A declined task can only be offered to someone else, or cleared.");
      return { kind: "assigned", fields: { assignee, assignedBy: tx.user, assignment: assignee === tx.user ? "accepted" : "offered" } };
    }
    case "accept":
      return { kind: "accepted", fields: { assignment: "accepted" } };
    case "decline":
      return { kind: "declined", fields: { assignment: "declined" } };
    default:
      return { kind: "recalled", fields: { assignee: "", assignedBy: "", assignment: "none" } };
  }
}

export const taskAssign = defineCommand("task.assign", (tx: Tx, input: TaskAssignInput) => {
  const now = requireNow(tx, input);
  const task = loadTask(tx, input.id);
  if (!Object.hasOwn(ACTION_NAMES, input.action)) tx.fail("The assignment action must be assign, accept, decline, recall or clear.");
  const state = stateOf(task);
  if (!ALLOWED[state].includes(input.action)) tx.fail(`A task that is ${state === "none" ? "not assigned" : state} can't be ${ACTION_NAMES[input.action]}.`);
  checkActor(tx, task, state, input.action);
  const result = outcome(tx, task, state, input);
  tx.put("tasks", task.id, result.fields);
  const from = task.assignee ?? "";
  const to = result.fields.assignee ?? from;
  logTask(tx, now, task, { kind: result.kind, from, to, note: `${state} to ${result.fields.assignment}` });
  return result.fields.assignment;
});
