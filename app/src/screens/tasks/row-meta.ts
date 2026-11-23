// What a task row shows under its title: at most three quiet items, most
// important first: the date, who it is for, and the principal tag.
import type { RowOf } from "@trellis/framework";
import { isOverdue } from "@/domain/selectors";

type Task = RowOf<"tasks">;

export const MAX_META_ITEMS = 3;

export type MetaItem =
  | { kind: "date"; date: string; deadline: boolean; overdue: boolean }
  | { kind: "assignee"; userId: string }
  | { kind: "principal"; code: string };

export interface MetaContext {
  today: string;
  /** Whoever is looking at the list; their own name is not repeated. */
  viewerId: string;
  /** Principal id to code. */
  principalCodes: ReadonlyMap<string, string>;
}

function dateItem(task: Task, today: string): MetaItem | undefined {
  const date = task.due || task.deadline;
  if (!date) return undefined;
  return { kind: "date", date, deadline: !task.due, overdue: isOverdue(task, today) };
}

export function rowMeta(task: Task, context: MetaContext): MetaItem[] {
  const assignee = task.assignee && task.assignee !== context.viewerId ? task.assignee : undefined;
  const code = task.principal ? context.principalCodes.get(task.principal) : undefined;
  const items: (MetaItem | undefined)[] = [
    dateItem(task, context.today),
    assignee === undefined ? undefined : { kind: "assignee", userId: assignee },
    code === undefined ? undefined : { kind: "principal", code },
  ];
  return items.filter((item): item is MetaItem => item !== undefined).slice(0, MAX_META_ITEMS);
}
