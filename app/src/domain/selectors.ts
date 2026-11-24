// Pure reads over rows. Every row's fields are optional and any reference may
// point at a record that has not arrived, so nothing here assumes a match.
import type { RowOf } from "@trellis/framework";
import { todayIn } from "./dates";

export type Task = RowOf<"tasks">;
export type Event = RowOf<"events">;
export type Overlay = RowOf<"overlays">;
export type Section = RowOf<"sections">;
export type Person = RowOf<"people">;

const DAY_MS = 86_400_000;

const live = <T extends { _deleted: boolean }>(row: T) => !row._deleted;
const open = (task: Task) => live(task) && task.done !== true;

/** By order, then id, so ties (two devices adding at once) still sort the same everywhere. */
export const byOrder = (a: { order?: number; id: string }, b: { order?: number; id: string }): number =>
  (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id);

const byStart = (a: Event, b: Event) => (a.start ?? "").localeCompare(b.start ?? "") || a.id.localeCompare(b.id);

const dates = (task: Task): string[] => [task.due, task.deadline].filter((d): d is string => typeof d === "string" && d !== "");

/** Overdue: a due date or deadline before today. */
export const isOverdue = (task: Task, today: string): boolean => dates(task).some((d) => d < today);

/** Due today: not overdue, and a due date or deadline of today. */
export const isDueToday = (task: Task, today: string): boolean => !isOverdue(task, today) && dates(task).includes(today);

const earliest = (task: Task) => dates(task).sort()[0] ?? "";
const byEarliest = (a: Task, b: Task) => earliest(a).localeCompare(earliest(b)) || byOrder(a, b);

/** Whether the task is the user's: assigned to them (and not declined), or unassigned and created by them. */
export function isUsersTask(task: Task, user: string): boolean {
  if (!task.assignee) return task.createdBy === user;
  return task.assignee === user && task.assignment !== "declined";
}

/** The user's open tasks that are overdue or due today, overdue first. */
export function todayTasks(tasks: readonly Task[], user: string, today: string): Task[] {
  const mine = tasks.filter((t) => open(t) && isUsersTask(t, user));
  return [...mine.filter((t) => isOverdue(t, today)).sort(byEarliest), ...mine.filter((t) => isDueToday(t, today)).sort(byOrder)];
}

/** Open tasks in an Inbox, in order. */
export function inboxTasks(tasks: readonly Task[], inboxId: string): Task[] {
  return tasks.filter((t) => open(t) && t.project === inboxId).sort(byOrder);
}

export interface SectionGroup {
  /** Undefined for the tasks with no section, or whose section has not arrived. */
  section: Section | undefined;
  tasks: Task[];
}

/** A project's open tasks grouped by section: unsectioned first, then each section in order. */
export function projectTasks(tasks: readonly Task[], sections: readonly Section[], projectId: string): SectionGroup[] {
  const ordered = sections.filter((s) => live(s) && s.project === projectId).sort(byOrder);
  const known = new Set(ordered.map((s) => s.id));
  const inProject = tasks.filter((t) => open(t) && t.project === projectId).sort(byOrder);
  const loose = inProject.filter((t) => !t.section || !known.has(t.section));
  return [{ section: undefined, tasks: loose }, ...ordered.map((section) => ({ section, tasks: inProject.filter((t) => t.section === section.id) }))];
}

/** Removed tasks, newest first. Pass rows read with includeDeleted. */
export function binTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => t._deleted).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.id.localeCompare(b.id));
}

/** A principal's events that are not gone, by start. */
export function eventsForPrincipal(events: readonly Event[], principal: string): Event[] {
  return events.filter((e) => live(e) && e.principal === principal && e.gone !== true).sort(byStart);
}

const personOf = (people: readonly Person[], userId: string) => people.find((p) => live(p) && p.userId === userId);

export const isViewer = (people: readonly Person[], userId: string): boolean => personOf(people, userId)?.mode === "viewer";

export const hasAckedPrivacy = (people: readonly Person[], userId: string): boolean => Boolean(personOf(people, userId)?.privacyAckAt);
