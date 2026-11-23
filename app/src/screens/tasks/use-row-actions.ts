// What every task list needs for its rows: the metadata context, opening a
// task, completing one, and the last failure to show.
import { useCallback, useMemo } from "react";
import type { RowOf } from "@trellis/framework";
import { useApp } from "@/app/app-state";
import { commands } from "@/domain/commands";
import { usePrincipalCodes } from "./people";
import { rowMeta, type MetaItem } from "./row-meta";
import { useRun } from "./use-run";

type Task = RowOf<"tasks">;

export interface RowActions {
  metaOf(task: Task): MetaItem[];
  open(task: Task): void;
  /** Undefined for a viewer, so rows render read-only. */
  toggle?: (task: Task) => void;
  error: string | null;
  isViewer: boolean;
}

export function useRowActions(): RowActions {
  const { today, userId, isViewer, openPanel } = useApp();
  const principalCodes = usePrincipalCodes();
  const complete = useRun(commands.taskComplete);
  const runComplete = complete.run;
  const context = useMemo(() => ({ today, viewerId: userId, principalCodes }), [today, userId, principalCodes]);
  const metaOf = useCallback((task: Task) => rowMeta(task, context), [context]);
  const open = useCallback((task: Task) => openPanel({ kind: "task", id: task.id }), [openPanel]);
  const toggle = useCallback((task: Task) => void runComplete({ id: task.id, done: task.done !== true }), [runComplete]);
  return { metaOf, open, toggle: isViewer ? undefined : toggle, error: complete.error, isViewer };
}
