// The brief's assignment state table, as the actions one user may take now
// and a plain sentence for the state.
//   none     -> Assign (to someone: offered; to yourself: accepted)
//   offered  -> assignee: Accept, Decline; assigner: Recall
//   accepted -> assignee: Hand back (declined); assigner: Recall
//   declined -> assigner: Reassign (offered), Clear
import type { RowOf } from "@trellis/framework";
import type { AssignAction } from "@/domain/commands";

type Task = RowOf<"tasks">;
export type AssignmentState = "none" | "offered" | "accepted" | "declined";

export interface AssignChoice {
  label: string;
  action: AssignAction;
  /** Needs a person to be chosen first. */
  needsPerson: boolean;
}

export const stateOf = (task: Task): AssignmentState => {
  const state = task.assignment;
  return state === "offered" || state === "accepted" || state === "declined" ? state : "none";
};

const ASSIGN: AssignChoice = { label: "Assign", action: "assign", needsPerson: true };
const REASSIGN: AssignChoice = { label: "Reassign", action: "assign", needsPerson: true };
const ACCEPT: AssignChoice = { label: "Accept", action: "accept", needsPerson: false };
const DECLINE: AssignChoice = { label: "Decline", action: "decline", needsPerson: false };
const HAND_BACK: AssignChoice = { label: "Hand back", action: "decline", needsPerson: false };
const RECALL: AssignChoice = { label: "Recall", action: "recall", needsPerson: false };
const CLEAR: AssignChoice = { label: "Clear", action: "clear", needsPerson: false };

/** The actions valid for this state and this user, in the order they are shown. */
export function assignChoices(task: Task, userId: string): AssignChoice[] {
  const isAssignee = task.assignee === userId;
  const isAssigner = task.assignedBy === userId;
  switch (stateOf(task)) {
    case "none":
      return [ASSIGN];
    case "offered":
      return [...(isAssignee ? [ACCEPT, DECLINE] : []), ...(isAssigner ? [RECALL] : [])];
    case "accepted":
      return [...(isAssignee ? [HAND_BACK] : []), ...(isAssigner ? [RECALL] : [])];
    case "declined":
      return isAssigner ? [REASSIGN, CLEAR] : [];
  }
}

/** "Offered to user-b by user-a", and so on. */
export function describeAssignment(task: Task): string {
  const to = task.assignee || "someone";
  const by = task.assignedBy || "someone";
  switch (stateOf(task)) {
    case "none":
      return "Not assigned";
    case "offered":
      return `Offered to ${to} by ${by}`;
    case "accepted":
      return to === by ? `Taken on by ${to}` : `Accepted by ${to}, assigned by ${by}`;
    case "declined":
      return `Declined by ${to}, assigned by ${by}`;
  }
}
