// Inbox, Today and the Bin: lists without sections.
import { useMemo } from "react";
import { useRecords, type RowOf } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/app/ui";
import { useApp } from "@/app/app-state";
import { commands } from "@/domain/commands";
import { binTasks, inboxTasks, isOverdue, todayTasks } from "@/domain/selectors";
import { useInbox } from "./people";
import { ErrorLine, ListBody, TaskGroup } from "./list-parts";
import { TaskRow } from "./task-row";
import { useRowActions, type RowActions } from "./use-row-actions";
import { useRun } from "./use-run";

type Task = RowOf<"tasks">;

interface RowsProps {
  tasks: readonly Task[];
  actions: RowActions;
}

function Rows({ tasks, actions }: RowsProps) {
  return tasks.map((task) => (
    <TaskRow key={task.id} task={task} meta={actions.metaOf(task)} onOpen={() => actions.open(task)} onToggle={actions.toggle && (() => actions.toggle?.(task))} />
  ));
}

export function InboxList() {
  const { userId } = useApp();
  const inbox = useInbox(userId);
  const tasks = useRecords("tasks");
  const actions = useRowActions();
  const list = useMemo(() => (inbox ? inboxTasks(tasks, inbox.id) : []), [tasks, inbox]);
  return (
    <>
      <PageHeader title="Inbox" />
      <ListBody>
        <ErrorLine error={actions.error} />
        {list.length === 0 ? <EmptyState title="Your Inbox is empty" /> : <TaskGroup><Rows tasks={list} actions={actions} /></TaskGroup>}
      </ListBody>
    </>
  );
}

export function TodayList() {
  const { userId, today } = useApp();
  const tasks = useRecords("tasks");
  const actions = useRowActions();
  const list = useMemo(() => todayTasks(tasks, userId, today), [tasks, userId, today]);
  const overdue = list.filter((t) => isOverdue(t, today));
  const dueToday = list.filter((t) => !isOverdue(t, today));
  return (
    <>
      <PageHeader title="Today" />
      <ListBody>
        <ErrorLine error={actions.error} />
        {list.length === 0 && <EmptyState title="Nothing due today" />}
        {overdue.length > 0 && <TaskGroup title="Overdue"><Rows tasks={overdue} actions={actions} /></TaskGroup>}
        {dueToday.length > 0 && <TaskGroup title="Today"><Rows tasks={dueToday} actions={actions} /></TaskGroup>}
      </ListBody>
    </>
  );
}

/** Removed tasks the user created or was assigned. */
export const usersBin = (tasks: readonly Task[], userId: string): Task[] =>
  binTasks(tasks).filter((t) => t.createdBy === userId || t.assignee === userId);

export function BinList() {
  const { userId } = useApp();
  const tasks = useRecords("tasks", { includeDeleted: true });
  const actions = useRowActions();
  const restore = useRun(commands.taskRemove);
  const list = useMemo(() => usersBin(tasks, userId), [tasks, userId]);
  const restoreButton = (task: Task) =>
    actions.isViewer ? undefined : (
      <Button variant="outline" size="sm" aria-label={`Restore ${task.title || "Untitled"}`} onClick={() => restore.run({ id: task.id, restore: true })}>
        Restore
      </Button>
    );
  return (
    <>
      <PageHeader title="Bin" />
      <ListBody>
        <ErrorLine error={restore.error} />
        {list.length === 0 ? <EmptyState title="The bin is empty" /> : (
          <TaskGroup>
            {list.map((task) => (
              <TaskRow key={task.id} task={task} meta={actions.metaOf(task)} onOpen={() => actions.open(task)} action={restoreButton(task)} />
            ))}
          </TaskGroup>
        )}
      </ListBody>
    </>
  );
}
