// The choices the task panel's selects offer.
import { useMemo } from "react";
import { useRecords, type RowOf } from "@trellis/framework";
import { useActivePrincipals } from "@/app/principals";
import { sharedProject } from "@/app/frame-data";
import { byOrder } from "@/domain/selectors";
import { inboxOf } from "@/screens/tasks/people";
import type { SelectOption } from "./native-select";

type Task = RowOf<"tasks">;

export const PRIORITY_OPTIONS: readonly SelectOption[] = [1, 2, 3, 4].map((p) => ({ value: String(p), label: `P${p}` }));

const NONE: SelectOption = { value: "", label: "None" };

type Principal = RowOf<"principals">;

/**
 * None and the active principals, plus the task's own tag even if that
 * principal is no longer active. With no active principal at all, just None.
 */
export function principalOptions(active: readonly Principal[], all: readonly Principal[], tag: string | undefined): SelectOption[] {
  if (active.length === 0) return [NONE];
  const options = active.map((p) => ({ value: p.id, label: p.code ?? p.id }));
  const missing = tag && !options.some((o) => o.value === tag) ? [{ value: tag, label: all.find((p) => p.id === tag)?.code ?? "Unknown principal" }] : [];
  return [NONE, ...options, ...missing];
}

export function usePrincipalOptions(task: Task): SelectOption[] {
  const active = useActivePrincipals();
  const all = useRecords("principals");
  return useMemo(() => principalOptions(active, all, task.principal), [active, all, task.principal]);
}

/** The user's Inbox and the shared project, and the task's own project if it is another. */
export function useProjectOptions(task: Task, userId: string): SelectOption[] {
  const projects = useRecords("projects");
  return useMemo(() => {
    const picks = [inboxOf(projects, userId), sharedProject(projects)].filter((p): p is RowOf<"projects"> => p !== undefined);
    const own = projects.find((p) => p.id === task.project);
    const list = own && !picks.includes(own) ? [...picks, own] : picks;
    const options = list.map((p) => ({ value: p.id, label: p.name || "Untitled project" }));
    return task.project && !options.some((o) => o.value === task.project) ? [...options, { value: task.project, label: "Not synced yet" }] : options;
  }, [projects, userId, task.project]);
}

export function useSectionOptions(task: Task): SelectOption[] {
  const sections = useRecords("sections");
  return useMemo(() => {
    const options = sections.filter((s) => s.project === task.project).sort(byOrder).map((s) => ({ value: s.id, label: s.name || "Untitled section" }));
    return [{ value: "", label: "No section" }, ...options];
  }, [sections, task.project]);
}
