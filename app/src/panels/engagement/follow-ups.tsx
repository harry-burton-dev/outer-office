// The tasks linked to an engagement, and adding a follow-up tagged to its principal.
import { useState, type FormEvent } from "react";
import { useCommand, useRecords } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/app/app-state";
import { usePeople } from "@/app/people";
import { DateText } from "@/app/ui";
import { commands } from "@/domain/commands";
import { byOrder, type Event, type Task } from "@/domain/selectors";

export interface FollowUpsProps {
  event: Event;
}

interface TaskRowProps {
  task: Task;
}

function TaskRow({ task }: TaskRowProps) {
  const { openPanel } = useApp();
  const { nameOf } = usePeople();
  return (
    <li>
      <button
        type="button"
        className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => openPanel({ kind: "task", id: task.id })}
      >
        <span className={task.done ? "min-w-0 flex-1 truncate text-muted-foreground line-through" : "min-w-0 flex-1 truncate"}>{task.title || "Untitled"}</span>
        {task.assignee && <span className="text-xs text-muted-foreground">{nameOf(task.assignee)}</span>}
        {task.due && <span className="text-xs text-muted-foreground"><DateText value={task.due} /></span>}
      </button>
    </li>
  );
}

function AddFollowUp({ event }: FollowUpsProps) {
  const { now } = useApp();
  const run = useCommand(commands.taskAdd);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = run({ now, title, event: event.id, principal: event.principal || undefined });
    setError(result.ok ? "" : result.error);
    if (result.ok) setTitle("");
  };
  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <div className="flex gap-2">
        <Input aria-label="Follow-up" placeholder="Follow-up title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" variant="outline" disabled={title.trim() === ""}>Add follow-up</Button>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </form>
  );
}

export function FollowUps({ event }: FollowUpsProps) {
  const { isViewer } = useApp();
  const tasks = useRecords("tasks", { where: (t) => t.event === event.id, sort: byOrder });
  return (
    <section className="flex flex-col gap-2" aria-label="Follow-ups">
      <h3 className="font-medium">Follow-ups</h3>
      {tasks.length > 0 && <ul className="flex flex-col">{tasks.map((task) => <TaskRow key={task.id} task={task} />)}</ul>}
      {tasks.length === 0 && isViewer && <p className="text-muted-foreground">None</p>}
      {!isViewer && <AddFollowUp event={event} />}
    </section>
  );
}
