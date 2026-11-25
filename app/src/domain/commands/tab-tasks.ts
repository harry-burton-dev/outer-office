// The tasks a tab template creates, and task.retime, which keeps them timed
// to their engagement after it moves (OUT-88).
import { defineCommand, type Tx } from "@trellis/framework";
import { templateTasksOf } from "../cards";
import { dueBefore, tasksOutOfStep } from "../tab-tasks";
import { OFFICE_ID } from "./office";
import { ensureInbox } from "./projects";
import { requireNow, requireText } from "./shared";
import { endOrder, logTask } from "./task-common";

const zoneOf = (tx: Tx): string => tx.get("office", OFFICE_ID)?.timezone || "Europe/London";

/** The shared project, as the Tasks screen finds it; the caller's Inbox when there is none yet. */
function sharedProjectOf(tx: Tx): string {
  const shared = tx.list("projects").filter((p) => p.inbox !== true && p.archived !== true).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  return shared?.id ?? ensureInbox(tx);
}

/** Creates a tab's tasks from its template, unless the tab already has some (it was removed and applied again). */
export function createTabTasks(tx: Tx, now: string, tab: string, event: { id: string; start?: string; principal?: string }, tasksJson: string | undefined): void {
  const tasks = templateTasksOf(tasksJson);
  if (tasks.length === 0 || tx.list("tasks").some((t) => t.tab === tab)) return;
  const zone = zoneOf(tx);
  const project = sharedProjectOf(tx);
  let order = endOrder(tx, project, "");
  for (const task of tasks) {
    const id = tx.newId();
    const owner = task.owner;
    tx.put("tasks", id, {
      title: task.title, notes: "", project, section: "", order: order++, priority: 4,
      due: dueBefore(event, task.daysBefore, zone), deadline: "", done: false, doneAt: "", doneBy: "",
      assignee: owner, assignedBy: owner === "" ? "" : tx.user, assignment: owner === "" ? "none" : owner === tx.user ? "accepted" : "offered",
      principal: event.principal ?? "", event: event.id, createdAt: now, createdBy: tx.user, tags: "", tab, offsetDays: task.daysBefore,
    });
    logTask(tx, now, { id, principal: event.principal, event: event.id }, { kind: "created", to: task.title, note: "From a tab template" });
  }
}

/** Moves an engagement's open tab tasks so each keeps its days before the engagement. Returns how many moved. */
export const taskRetime = defineCommand("task.retime", (tx: Tx, input: { now: string; event: string }) => {
  const now = requireNow(tx, input);
  const event = tx.get("events", requireText(tx, input.event, "The engagement"));
  if (!event || event._deleted) tx.fail("That engagement hasn't arrived on this computer yet.");
  const zone = zoneOf(tx);
  const moving = tasksOutOfStep(event, tx.list("tasks"), zone);
  for (const task of moving) {
    const due = dueBefore(event, task.offsetDays ?? 0, zone);
    tx.put("tasks", task.id, { due });
    logTask(tx, now, task, { kind: "edited", note: "Changed: due (moved with its engagement)", from: task.due ?? "", to: due });
  }
  return moving.length;
});
