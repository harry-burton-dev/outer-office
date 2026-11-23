// The task's fields as plain text, for a viewer.
import type { ReactNode } from "react";
import { useField, useRecord, type RowOf } from "@trellis/framework";
import { DateText } from "@/app/ui";
import { NeedsDecision } from "./needs-decision";

type Task = RowOf<"tasks">;

export interface TaskDetailsProps {
  task: Task;
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const dateOr = (value: string | undefined) => (value ? <DateText value={value} /> : "None");

export function TaskDetails({ task }: TaskDetailsProps) {
  const principal = useRecord("principals", task.principal ?? "");
  const project = useRecord("projects", task.project ?? "");
  const section = useRecord("sections", task.section ?? "");
  const deadline = useField("tasks", task.id, "deadline");
  return (
    <dl className="grid grid-cols-2 gap-4">
      <div className="col-span-2"><Item label="Notes">{task.notes || "None"}</Item></div>
      <Item label="Due">{dateOr(task.due)}</Item>
      <Item label="Deadline">{dateOr(task.deadline)}{deadline.conflict && <NeedsDecision />}</Item>
      <Item label="Priority">P{task.priority ?? 4}</Item>
      <Item label="Principal">{task.principal ? (principal?.code ?? "Not synced yet") : "None"}</Item>
      <Item label="Project">{project?.name ?? "Not synced yet"}</Item>
      <Item label="Section">{task.section ? (section?.name ?? "Not synced yet") : "None"}</Item>
    </dl>
  );
}
