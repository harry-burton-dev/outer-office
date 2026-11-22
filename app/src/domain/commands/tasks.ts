// The task commands. Each writes exactly one log row (area "task") in the same run.
import { defineCommand, type Tx } from "@trellis/framework";
import { between } from "../order";
import { ensureInbox } from "./projects";
import { changedKeys, defined, optionalDate, optionalText, requireNow, requireText } from "./shared";
import { endOrder, loadTask, logTask, optionalPriority, requirePrincipalTag, requireProject, requireSectionOf, type Task } from "./task-common";

export interface TaskAddInput {
  now: string;
  title: string;
  notes?: string;
  /** Leave out for the caller's Inbox. */
  project?: string;
  section?: string;
  priority?: 1 | 2 | 3 | 4;
  /** YYYY-MM-DD */
  due?: string;
  /** YYYY-MM-DD */
  deadline?: string;
  /** A principal id. */
  principal?: string;
  /** An event id. */
  event?: string;
  /** A user id. Yourself is accepted at once; anyone else is offered the task. */
  assignee?: string;
}

function assignmentOnAdd(tx: Tx, assignee: string | undefined) {
  if (assignee === undefined || assignee === "") return { assignee: "", assignedBy: "", assignment: "none" };
  return { assignee, assignedBy: tx.user, assignment: assignee === tx.user ? "accepted" : "offered" };
}

export const taskAdd = defineCommand("task.add", (tx: Tx, input: TaskAddInput) => {
  const now = requireNow(tx, input);
  const title = requireText(tx, input.title, "The task's title");
  const project = input.project === undefined ? ensureInbox(tx) : requireProject(tx, input.project);
  const section = requireSectionOf(tx, input.section, project);
  const principal = requirePrincipalTag(tx, input.principal) ?? "";
  const event = optionalText(tx, input.event, "The engagement") ?? "";
  const fields = {
    title, notes: optionalText(tx, input.notes, "The notes") ?? "", project, section,
    order: endOrder(tx, project, section), priority: optionalPriority(tx, input.priority) ?? 4,
    due: optionalDate(tx, input.due, "The due date") ?? "", deadline: optionalDate(tx, input.deadline, "The deadline") ?? "",
    done: false, doneAt: "", doneBy: "", principal, event, createdAt: now, createdBy: tx.user,
    ...assignmentOnAdd(tx, optionalText(tx, input.assignee, "The assignee")),
  };
  const id = tx.newId();
  tx.put("tasks", id, fields);
  logTask(tx, now, { id, principal, event }, { kind: "created", to: title });
  return id;
});

export interface TaskUpdateInput {
  now: string;
  id: string;
  title?: string;
  notes?: string;
  priority?: 1 | 2 | 3 | 4;
  /** YYYY-MM-DD, or "" to clear. */
  due?: string;
  /** YYYY-MM-DD, or "" to clear. */
  deadline?: string;
  /** A principal id, or "" to clear. */
  principal?: string;
  /** Moving project puts the task at the end of the new project, in the given section or none. */
  project?: string;
  section?: string;
}

function placement(tx: Tx, task: Task & { id: string }, input: TaskUpdateInput) {
  const project = input.project === undefined ? task.project ?? "" : requireProject(tx, input.project);
  const movedProject = project !== task.project;
  if (input.section === undefined && !movedProject) return {};
  const section = input.section === undefined ? "" : requireSectionOf(tx, input.section, project);
  const order = section === (task.section ?? "") && !movedProject ? undefined : endOrder(tx, project, section, task.id);
  return defined({ project, section, order });
}

const shown = (value: unknown) => (value === undefined ? "" : String(value));

export const taskUpdate = defineCommand("task.update", (tx: Tx, input: TaskUpdateInput) => {
  const now = requireNow(tx, input);
  const task = loadTask(tx, input.id);
  const fields = {
    ...defined({
      title: input.title === undefined ? undefined : requireText(tx, input.title, "The task's title"),
      notes: optionalText(tx, input.notes, "The notes"),
      priority: optionalPriority(tx, input.priority),
      due: optionalDate(tx, input.due, "The due date"),
      deadline: optionalDate(tx, input.deadline, "The deadline"),
      principal: requirePrincipalTag(tx, input.principal),
    }),
    ...placement(tx, task, input),
  };
  const changed = changedKeys(task, fields).filter((key) => key !== "order");
  if (changed.length === 0) tx.fail("Nothing about the task has changed.");
  tx.put("tasks", task.id, fields);
  const single = changed.length === 1 && changed[0] !== "notes" ? changed[0] : undefined;
  logTask(tx, now, { ...task, principal: fields.principal ?? task.principal }, {
    kind: "edited",
    note: `Changed: ${changed.join(", ")}`,
    ...(single ? { from: shown(task[single]), to: shown(fields[single]) } : {}),
  });
  return task.id;
});

export interface TaskMoveInput {
  now: string;
  id: string;
  /** The task it now sits after; leave out at the top. */
  previous?: string;
  /** The task it now sits before; leave out at the bottom. */
  next?: string;
  /** "" for no section. Leave out to keep the section. */
  section?: string;
}

const orderOf = (tx: Tx, id: string | undefined): number | undefined => (id === undefined ? undefined : tx.get("tasks", id)?.order);

export const taskMove = defineCommand("task.move", (tx: Tx, input: TaskMoveInput) => {
  const now = requireNow(tx, input);
  const task = loadTask(tx, input.id);
  if (input.previous === task.id || input.next === task.id) tx.fail("A task can't be placed next to itself.");
  const project = task.project ?? "";
  const section = input.section === undefined ? task.section ?? "" : requireSectionOf(tx, input.section, project);
  const before = orderOf(tx, input.previous);
  const after = orderOf(tx, input.next);
  const order = before === undefined && after === undefined ? endOrder(tx, project, section, task.id) : between(before, after);
  tx.put("tasks", task.id, { section, order });
  const sectionChanged = section !== (task.section ?? "");
  logTask(tx, now, task, sectionChanged
    ? { kind: "moved", from: task.section ?? "", to: section, note: "Moved to another section" }
    : { kind: "moved", from: shown(task.order), to: String(order), note: "Reordered" });
  return order;
});

export interface TaskCompleteInput {
  now: string;
  id: string;
  /** true completes, false reopens. */
  done: boolean;
}

export const taskComplete = defineCommand("task.complete", (tx: Tx, input: TaskCompleteInput) => {
  const now = requireNow(tx, input);
  const task = loadTask(tx, input.id);
  if (typeof input.done !== "boolean") tx.fail("Say whether the task is done or not.");
  if (input.done === (task.done === true)) tx.fail(input.done ? "That task is already done." : "That task is already open.");
  tx.put("tasks", task.id, input.done ? { done: true, doneAt: now, doneBy: tx.user } : { done: false, doneAt: "", doneBy: "" });
  logTask(tx, now, task, input.done ? { kind: "completed", to: now } : { kind: "reopened", from: task.doneAt ?? "" });
  return input.done;
});

export interface TaskLinkInput {
  now: string;
  id: string;
  /** An event id, or "" to unlink. */
  event: string;
}

export const taskLink = defineCommand("task.link", (tx: Tx, input: TaskLinkInput) => {
  const now = requireNow(tx, input);
  const task = loadTask(tx, input.id);
  if (typeof input.event !== "string") tx.fail("The engagement must be given as text, or empty to unlink.");
  const before = task.event ?? "";
  if (input.event === before) tx.fail(input.event === "" ? "That task isn't linked to an engagement." : "That task is already linked to this engagement.");
  tx.put("tasks", task.id, { event: input.event });
  logTask(tx, now, { ...task, event: input.event || before }, { kind: input.event === "" ? "unlinked" : "linked", from: before, to: input.event });
  return input.event;
});

export interface TaskRemoveInput {
  now: string;
  id: string;
  /** true brings the task back from the bin. */
  restore?: boolean;
}

export const taskRemove = defineCommand("task.remove", (tx: Tx, input: TaskRemoveInput) => {
  const now = requireNow(tx, input);
  if (input.restore !== undefined && typeof input.restore !== "boolean") tx.fail("Say whether to restore the task.");
  if (!input.restore) {
    const task = loadTask(tx, input.id);
    tx.remove("tasks", task.id);
    logTask(tx, now, task, { kind: "removed" });
    return task.id;
  }
  const task = typeof input.id === "string" && input.id !== "" ? tx.get("tasks", input.id) : undefined;
  if (!task) tx.fail("That task no longer exists.");
  if (!task._deleted) tx.fail("That task is not in the bin.");
  tx.restore("tasks", task.id);
  logTask(tx, now, task, { kind: "restored" });
  return task.id;
});
