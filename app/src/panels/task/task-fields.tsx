// The task's editable fields. Each saves on change or blur through
// task.update, and only when its value really changed.
import { useCallback } from "react";
import { useField, type RowOf } from "@trellis/framework";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/app/ui";
import { commands, type TaskUpdateInput } from "@/domain/commands";
import { useRun } from "@/screens/tasks/use-run";
import { PRIORITY_OPTIONS, usePrincipalOptions, useProjectOptions, useSectionOptions } from "./field-options";
import { NativeSelect } from "./native-select";
import { NeedsDecision } from "./needs-decision";

type Task = RowOf<"tasks">;
export type TaskPatch = Omit<TaskUpdateInput, "now" | "id">;

const trimmed = (value: unknown) => (typeof value === "string" ? value.trim() : value);

/** The patch without the keys whose value is what the task already has (text compared trimmed, as the command stores it). */
export function changedOnly(task: Task, patch: TaskPatch): TaskPatch {
  const current = task as Record<string, unknown>;
  const stored = (key: string) => current[key] ?? (key === "priority" ? 4 : "");
  return Object.fromEntries(
    Object.entries(patch)
      .map(([key, value]) => [key, trimmed(value)] as const)
      .filter(([key, value]) => value !== undefined && value !== stored(key)),
  ) as TaskPatch;
}

export interface TaskSaver {
  save(patch: TaskPatch): void;
  error: string | null;
}

export function useTaskSaver(task: Task): TaskSaver {
  const update = useRun(commands.taskUpdate);
  const run = update.run;
  const save = useCallback(
    (patch: TaskPatch) => {
      const changed = changedOnly(task, patch);
      if (Object.keys(changed).length > 0) run({ id: task.id, ...changed });
    },
    [task, run],
  );
  return { save, error: update.error };
}

interface FieldsProps {
  task: Task;
  userId: string;
  save(patch: TaskPatch): void;
}

function DateFields({ task, save }: Omit<FieldsProps, "userId">) {
  const deadline = useField("tasks", task.id, "deadline");
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Due" htmlFor="task-due">
        <Input id="task-due" type="date" value={task.due ?? ""} onChange={(e) => save({ due: e.target.value })} />
      </Field>
      <div className="flex flex-col gap-2">
        <label htmlFor="task-deadline" className="text-sm font-medium">
          Deadline{deadline.conflict && <NeedsDecision />}
        </label>
        <Input id="task-deadline" type="date" value={task.deadline ?? ""} onChange={(e) => save({ deadline: e.target.value })} />
      </div>
    </div>
  );
}

function PlacementFields({ task, userId, save }: FieldsProps) {
  const projects = useProjectOptions(task, userId);
  const sections = useSectionOptions(task);
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Project" htmlFor="task-project">
        <NativeSelect id="task-project" options={projects} value={task.project ?? ""} onChange={(e) => save({ project: e.target.value })} />
      </Field>
      <Field label="Section" htmlFor="task-section">
        <NativeSelect id="task-section" options={sections} value={task.section ?? ""} onChange={(e) => save({ section: e.target.value })} />
      </Field>
    </div>
  );
}

export function TaskFields({ task, userId, save }: FieldsProps) {
  const principals = usePrincipalOptions(task);
  return (
    <div className="flex flex-col gap-4">
      <Field label="Notes" htmlFor="task-notes">
        <Textarea id="task-notes" key={`notes-${task.notes ?? ""}`} defaultValue={task.notes ?? ""} onBlur={(e) => save({ notes: e.target.value })} />
      </Field>
      <DateFields task={task} save={save} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Priority" htmlFor="task-priority">
          <NativeSelect id="task-priority" options={PRIORITY_OPTIONS} value={String(task.priority ?? 4)} onChange={(e) => save({ priority: Number(e.target.value) as 1 | 2 | 3 | 4 })} />
        </Field>
        <Field label="Principal" htmlFor="task-principal">
          <NativeSelect id="task-principal" options={principals} value={task.principal ?? ""} onChange={(e) => save({ principal: e.target.value })} />
        </Field>
      </div>
      <PlacementFields task={task} userId={userId} save={save} />
    </div>
  );
}
