// Helpers shared by the task commands.
import type { RowOf, Tx } from "@trellis/framework";
import { between } from "../order";
import { writeLog, type LogEntry } from "./shared";

export type Task = RowOf<"tasks">;
export type Assignment = "none" | "offered" | "accepted" | "declined";

/** The task, or a plain-English failure when it is missing or in the bin. */
export function loadTask(tx: Tx, id: unknown): Task & { id: string } {
  if (typeof id !== "string" || id === "") tx.fail("No task was given.");
  const task = tx.get("tasks", id);
  if (!task) tx.fail("That task no longer exists.");
  if (task._deleted) tx.fail("That task is in the bin. Restore it first.");
  return task;
}

/** The one log row every task command writes, filed under the task's principal tag. */
export function logTask(tx: Tx, now: string, task: { id: string; principal?: string; event?: string }, entry: Omit<LogEntry, "area" | "task">): void {
  writeLog(tx, now, { principal: task.principal ?? "", event: task.event ?? "", ...entry, area: "task", task: task.id });
}

/** Fails unless the value is undefined or a whole number from 1 to 4. */
export function optionalPriority(tx: Tx, value: unknown): 1 | 2 | 3 | 4 | undefined {
  if (value === undefined) return undefined;
  if (value !== 1 && value !== 2 && value !== 3 && value !== 4) tx.fail("Priority must be 1, 2, 3 or 4.");
  return value;
}

/** Fails unless the project exists and is not in the bin. */
export function requireProject(tx: Tx, id: unknown): string {
  if (typeof id !== "string" || id === "") tx.fail("No project was given.");
  const project = tx.get("projects", id);
  if (!project || project._deleted) tx.fail("That project no longer exists.");
  return id;
}

/** Fails unless the section is "" (none) or a section of the project. */
export function requireSectionOf(tx: Tx, section: unknown, project: string): string {
  if (section === undefined || section === "") return "";
  if (typeof section !== "string") tx.fail("The section must be text.");
  const found = tx.get("sections", section);
  if (!found || found._deleted) tx.fail("That section no longer exists.");
  if (found.project !== project) tx.fail("That section belongs to another project.");
  return section;
}

/** Fails unless the principal tag is "" (none) or a principal that exists. */
export function requirePrincipalTag(tx: Tx, principal: unknown): string | undefined {
  if (principal === undefined || principal === "") return principal;
  if (typeof principal !== "string") tx.fail("The principal must be text.");
  const found = tx.get("principals", principal);
  if (!found || found._deleted) tx.fail("That principal no longer exists.");
  return principal;
}

/** An order after every task already in the project and section. */
export function endOrder(tx: Tx, project: string, section: string, exceptId?: string): number {
  const orders = tx.list("tasks")
    .filter((t) => t.id !== exceptId && t.project === project && (t.section ?? "") === section && typeof t.order === "number")
    .map((t) => t.order as number);
  return between(orders.length > 0 ? Math.max(...orders) : undefined, undefined);
}
