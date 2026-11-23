// The task panel: the title (edited inline), the fields, the assignment, the
// linked engagement and the history. Complete (or Reopen) is the one primary
// button. The frame owns the Sheet root and keys this component by task id.
import type { RowOf } from "@trellis/framework";
import { useRecord } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApp } from "@/app/app-state";
import { commands } from "@/domain/commands";
import { ErrorLine } from "@/screens/tasks/list-parts";
import { firstError, useRun } from "@/screens/tasks/use-run";
import { AssignmentBlock } from "./task/assignment-block";
import { LinkedEngagement } from "./task/linked-engagement";
import { TaskDetails } from "./task/task-details";
import { TaskFields, useTaskSaver, type TaskPatch } from "./task/task-fields";
import { TaskHistory } from "./task/task-history";

type Task = RowOf<"tasks">;

export interface TaskPanelProps {
  taskId: string;
}

const CONTENT = "data-[side=right]:w-full data-[side=right]:sm:max-w-120";

function Placeholder({ text }: { text: string }) {
  return (
    <SheetContent className={CONTENT}>
      <SheetHeader><SheetTitle>Task</SheetTitle></SheetHeader>
      <p className="px-4 text-sm text-muted-foreground">{text}</p>
    </SheetContent>
  );
}

interface TitleProps {
  task: Task;
  save(patch: TaskPatch): void;
}

function EditableTitle({ task, save }: TitleProps) {
  const title = task.title ?? "";
  return (
    <Input
      key={`title-${title}`}
      aria-label="Title"
      defaultValue={title}
      onBlur={(e) => (e.target.value.trim() === "" ? (e.target.value = title) : save({ title: e.target.value }))}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="h-9 border-transparent px-1 text-base font-medium shadow-none hover:border-input"
    />
  );
}

function Footer({ task, onRemoved }: { task: Task; onRemoved(): void }) {
  const complete = useRun(commands.taskComplete);
  const remove = useRun(commands.taskRemove);
  const done = task.done === true;
  return (
    <SheetFooter>
      <ErrorLine error={firstError(complete, remove)} />
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => remove.run({ id: task.id }) && onRemoved()}>Move to bin</Button>
        <Button onClick={() => complete.run({ id: task.id, done: !done })}>{done ? "Reopen" : "Complete"}</Button>
      </div>
    </SheetFooter>
  );
}

function TaskBody({ task }: { task: Task }) {
  const { userId, isViewer, closePanel } = useApp();
  const saver = useTaskSaver(task);
  return (
    <SheetContent className={CONTENT}>
      <SheetHeader className="pr-12">
        <SheetTitle className={isViewer ? undefined : "sr-only"}>{task.title || "Untitled"}</SheetTitle>
        {!isViewer && <EditableTitle task={task} save={saver.save} />}
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
        <ErrorLine error={saver.error} />
        {isViewer ? <TaskDetails task={task} /> : <TaskFields task={task} userId={userId} save={saver.save} />}
        <Separator />
        <AssignmentBlock task={task} userId={userId} isViewer={isViewer} />
        <LinkedEngagement task={task} isViewer={isViewer} />
        <Separator />
        <TaskHistory taskId={task.id} />
      </div>
      {!isViewer && <Footer task={task} onRemoved={closePanel} />}
    </SheetContent>
  );
}

export function TaskPanel({ taskId }: TaskPanelProps) {
  const task = useRecord("tasks", taskId);
  if (!task) return <Placeholder text="This task has not synced yet." />;
  if (task._deleted) return <Placeholder text="This task is in the bin." />;
  return <TaskBody task={task} />;
}
