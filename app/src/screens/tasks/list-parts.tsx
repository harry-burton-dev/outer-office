// Pieces the task lists share: a titled group of rows, and an inline error line.
import type { ReactNode } from "react";

export interface TaskGroupProps {
  /** Leave out for a group with no heading. */
  title?: string;
  /** Shown on the heading's right, as the project's section actions are. */
  actions?: ReactNode;
  children: ReactNode;
}

export function TaskGroup({ title, actions, children }: TaskGroupProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      {title !== undefined && (
        <div className="flex items-center justify-between gap-2 border-b pb-1">
          <h2 className="text-sm font-medium">{title}</h2>
          {actions}
        </div>
      )}
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  if (error === null) return null;
  return <p role="alert" className="text-xs text-destructive">{error}</p>;
}

export function ListBody({ children }: { children: ReactNode }) {
  return <div className="flex max-w-220 flex-col gap-6">{children}</div>;
}
