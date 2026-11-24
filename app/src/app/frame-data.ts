// Reads the frame shares with the screens: the office, the shared project, and
// the Needs action lists for the chosen principal.
import { useMemo } from "react";
import { useRecord, useRecords, type RowOf } from "@trellis/framework";
import { OFFICE_ID } from "@/domain/commands";
import { byOrder, needsAction, type NeedsAction } from "@/domain/selectors";
import { readinessByEvent } from "@/domain/readiness";
import { useDiaryEntry } from "@/automate/diary-inbox-state";
import type { InboxEntry } from "@/automate/diary-inbox";
import { useApp } from "./app-state";

export type Office = RowOf<"office">;
export type Project = RowOf<"projects">;

export const APP_NAME = "Outer Office";

/** The office record, or undefined until it exists (or when removed). */
export function useOffice(): Office | undefined {
  const office = useRecord("office", OFFICE_ID);
  return office && !office._deleted ? office : undefined;
}

/** The shared project: the first live project, by order, that is not an Inbox and not archived. */
export function sharedProject(projects: readonly Project[]): Project | undefined {
  return projects.filter((p) => !p._deleted && p.inbox !== true && p.archived !== true).sort(byOrder)[0];
}

export function useSharedProject(): Project | undefined {
  const projects = useRecords("projects");
  return useMemo(() => sharedProject(projects), [projects]);
}

const EMPTY: NeedsAction = { overdue: [], dueToday: [], prepNeeded: [], goneWithData: [] };

/** The Needs action lists for the chosen principal; all empty when there is none. */
export function useNeedsAction(): NeedsAction {
  const { principalId, now, timezone } = useApp();
  const tasks = useRecords("tasks");
  const events = useRecords("events");
  const overlays = useRecords("overlays");
  const tabs = useRecords("tabs");
  const cards = useRecords("cards");
  const templates = useRecords("templates");
  const readiness = useMemo(() => readinessByEvent(tabs, cards, templates), [tabs, cards, templates]);
  return useMemo(
    () => (principalId === null ? EMPTY : needsAction({ principal: principalId, tasks, events, overlays, readiness, now, timezone })),
    [principalId, tasks, events, overlays, readiness, now, timezone],
  );
}

export const needsActionCount = (lists: NeedsAction): number =>
  lists.overdue.length + lists.dueToday.length + lists.prepNeeded.length + lists.goneWithData.length;

/** The chosen principal's diary update from Power Automate that could not be applied, for people who can import; null otherwise. */
export function useDiaryForNeedsAction(): InboxEntry | null {
  const { principalId, isViewer } = useApp();
  const entry = useDiaryEntry(principalId);
  return isViewer || !entry || entry.ok ? null : entry;
}
