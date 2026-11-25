// Reads the frame shares with the screens: the office and the shared project.
// Needs action reads updates-data.
import { useMemo } from "react";
import { useRecord, useRecords, type RowOf } from "@trellis/framework";
import { OFFICE_ID } from "@/domain/commands";
import { byOrder } from "@/domain/selectors";

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
