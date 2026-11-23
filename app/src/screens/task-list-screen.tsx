// PLACEHOLDER: replace this file. Contract: keep the export name and its props.
// A screen renders inside the frame's content area (24 px padding already applied). It takes
// everything else from useApp() and the data hooks, and starts with <PageHeader title=... /> from
// @/app/ui. Lists cap their width at 880 px (max-w-220). For "project", the project is
// useSharedProject() from @/app/frame-data (the sidebar uses the same one).
import { PageHeader } from "@/app/ui";
import { useSharedProject } from "@/app/frame-data";

export interface TaskListScreenProps {
  list: "inbox" | "today" | "project" | "bin";
}

const TITLES: Record<Exclude<TaskListScreenProps["list"], "project">, string> = { inbox: "Inbox", today: "Today", bin: "Bin" };

export function TaskListScreen({ list }: TaskListScreenProps) {
  const project = useSharedProject();
  const title = list === "project" ? (project?.name ?? "Project") : TITLES[list];
  return <PageHeader title={title} />;
}
