// One task in a list: a round checkbox, the title, and one quiet line of
// metadata. The title opens the task panel. Move controls show on hover or focus.
import type { ReactNode } from "react";
import type { RowOf } from "@trellis/framework";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateText } from "@/app/ui";
import type { MetaItem } from "./row-meta";

type Task = RowOf<"tasks">;

export interface RowMoves {
  /** Undefined at the top of its group. */
  up?: () => void;
  /** Undefined at the bottom of its group. */
  down?: () => void;
}

export interface TaskRowProps {
  task: Task;
  meta: readonly MetaItem[];
  onOpen(): void;
  /** Leave out for a read-only row. */
  onToggle?: () => void;
  moves?: RowMoves;
  /** Replaces the move controls, as the bin's Restore does. */
  action?: ReactNode;
}

const titleOf = (task: Task) => task.title || "Untitled";

interface CheckMarkProps {
  task: Task;
  onToggle?: () => void;
}

function CheckMark({ task, onToggle }: CheckMarkProps) {
  const done = task.done === true;
  const ring = cn(
    "flex size-4 shrink-0 items-center justify-center rounded-full border",
    task.priority === 1 && !done ? "border-2 border-primary" : "border-muted-foreground/50",
    done && "border-muted-foreground bg-muted-foreground text-background",
  );
  if (!onToggle) return <span className={ring} aria-hidden="true">{done && <CheckIcon className="size-3" />}</span>;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${done ? "Reopen" : "Complete"} ${titleOf(task)}`}
      onClick={onToggle}
      className={cn(ring, "outline-none hover:border-foreground focus-visible:ring-3 focus-visible:ring-ring/50")}
    >
      {done && <CheckIcon className="size-3" />}
    </button>
  );
}

function MetaPart({ item }: { item: MetaItem }) {
  if (item.kind === "principal") return <Badge variant="outline">{item.code}</Badge>;
  if (item.kind === "assignee") return <span>{item.userId}</span>;
  return (
    <span className={cn(item.overdue && "text-destructive")}>
      {item.deadline && "Deadline "}
      <DateText value={item.date} />
      {item.overdue && ", overdue"}
    </span>
  );
}

export function RowMeta({ meta }: { meta: readonly MetaItem[] }) {
  if (meta.length === 0) return null;
  return (
    <span data-testid="row-meta" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {meta.map((item) => <MetaPart key={item.kind} item={item} />)}
    </span>
  );
}

function MoveControls({ moves, title }: { moves: RowMoves; title: string }) {
  const hidden = "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100";
  return (
    <div className={cn("flex shrink-0 items-center gap-1", hidden)}>
      <Button variant="ghost" size="icon-xs" aria-label={`Move ${title} up`} disabled={!moves.up} onClick={moves.up}>
        <ArrowUpIcon />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label={`Move ${title} down`} disabled={!moves.down} onClick={moves.down}>
        <ArrowDownIcon />
      </Button>
    </div>
  );
}

export function TaskRow({ task, meta, onOpen, onToggle, moves, action }: TaskRowProps) {
  const title = titleOf(task);
  return (
    <li className="group/row flex min-h-9 items-start gap-3 border-b py-2 last:border-b-0" data-testid="task-row">
      <span className="flex h-5 items-center"><CheckMark task={task} onToggle={onToggle} /></span>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className={cn("truncate text-sm", task.done === true && "text-muted-foreground line-through")}>{title}</span>
        <RowMeta meta={meta} />
      </button>
      {action ?? (moves && <MoveControls moves={moves} title={title} />)}
    </li>
  );
}
