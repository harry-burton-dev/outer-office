// Lookups the task screens share: principal codes and the user's Inbox.
// People by name live in @/app/people.
import { useMemo } from "react";
import { useRecords, type RowOf } from "@trellis/framework";

type Project = RowOf<"projects">;

/** Principal id to code, for every principal that has arrived (inactive ones too, so old tags still read). */
export function usePrincipalCodes(): ReadonlyMap<string, string> {
  const principals = useRecords("principals");
  return useMemo(() => new Map(principals.map((p) => [p.id, p.code ?? p.id])), [principals]);
}

/** The signed-in user's Inbox project, found by owner, or undefined until it exists. */
export function inboxOf(projects: readonly Project[], userId: string): Project | undefined {
  return projects.find((p) => !p._deleted && p.inbox === true && p.owner === userId);
}

export function useInbox(userId: string): Project | undefined {
  const projects = useRecords("projects");
  return useMemo(() => inboxOf(projects, userId), [projects, userId]);
}
