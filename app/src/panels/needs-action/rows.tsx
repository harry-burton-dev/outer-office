// The Needs action sections and their rows. Each row is one button that opens a panel.
import type { ReactNode } from "react";
import { useApp } from "@/app/app-state";
import { usePeople } from "@/app/people";
import { DateText, TimeText } from "@/app/ui";
import type { Event, Task } from "@/domain/selectors";
import { titleOf } from "@/screens/calendar/calendar-data";

const ROW_CLASS =
  "flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

export interface SectionProps {
  title: string;
  children: ReactNode;
}

export function Section({ title, children }: SectionProps) {
  const id = `needs-action-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className="flex flex-col gap-1" aria-labelledby={id}>
      <h3 id={id} className="px-2 text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

export interface TaskRowProps {
  task: Task;
  overdue: boolean;
}

export function TaskRow({ task, overdue }: TaskRowProps) {
  const { openPanel } = useApp();
  const due = task.due || task.deadline;
  const { nameOf } = usePeople();
  return (
    <li>
      <button type="button" className={ROW_CLASS} onClick={() => openPanel({ kind: "task", id: task.id })}>
        <span className="min-w-0 flex-1 truncate">{task.title || "Untitled"}</span>
        {task.assignee && <span className="text-xs text-muted-foreground">{nameOf(task.assignee)}</span>}
        {due && <span className={overdue ? "text-xs text-destructive" : "text-xs text-muted-foreground"}><DateText value={due} /></span>}
      </button>
    </li>
  );
}

export interface EventRowProps {
  event: Event;
  /** Show the day as well as the time. */
  withDay: boolean;
}

export function EventRow({ event, withDay }: EventRowProps) {
  const { openPanel } = useApp();
  return (
    <li>
      <button type="button" className={ROW_CLASS} onClick={() => openPanel({ kind: "engagement", id: event.id })}>
        {event.start && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {withDay && <><DateText value={event.start} />{" "}</>}
            <TimeText value={event.start} />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{titleOf(event)}</span>
      </button>
    </li>
  );
}

/** A diary update from Power Automate that could not be applied: opens the Import screen, which says why. */
export function DiaryRow() {
  const { go, closePanel } = useApp();
  return (
    <li>
      <button type="button" className={ROW_CLASS} onClick={() => { closePanel(); go("import"); }}>
        <span className="min-w-0 flex-1 truncate">Diary update can't be used</span>
      </button>
    </li>
  );
}
