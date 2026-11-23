// Who the app knows about. The framework's users table is not readable from
// app code, so people are the user ids seen in this workspace's own records.
import { useMemo } from "react";
import { useRecords, type RowOf } from "@trellis/framework";

type Person = RowOf<"people">;
type Task = RowOf<"tasks">;
type Project = RowOf<"projects">;

export interface KnownUsersInput {
  people: readonly Person[];
  tasks: readonly Task[];
  projects: readonly Project[];
  userId: string;
}

/** Every user id the records mention, the signed-in user included, sorted. */
export function knownUsers({ people, tasks, projects, userId }: KnownUsersInput): string[] {
  const ids = [
    userId,
    ...people.map((p) => p.userId),
    ...tasks.flatMap((t) => [t.createdBy, t.assignee, t.assignedBy]),
    ...projects.map((p) => p.owner),
  ].filter((id): id is string => typeof id === "string" && id.trim() !== "");
  return [...new Set(ids)].sort();
}

export function useKnownUsers(userId: string): string[] {
  const people = useRecords("people");
  const tasks = useRecords("tasks");
  const projects = useRecords("projects");
  return useMemo(() => knownUsers({ people, tasks, projects, userId }), [people, tasks, projects, userId]);
}

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
