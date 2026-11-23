// The task lists: Inbox, Today, the shared project and the Bin. Tasks are
// global, so nothing here follows the principal switch.
import { useApp } from "@/app/app-state";
import { BinList, InboxList, TodayList } from "./tasks/flat-lists";
import { ProjectList } from "./tasks/project-list";

export interface TaskListScreenProps {
  list: "inbox" | "today" | "project" | "bin";
}

export function TaskListScreen({ list }: TaskListScreenProps) {
  const { isViewer } = useApp();
  if (list === "inbox") return <InboxList />;
  if (list === "today") return <TodayList />;
  if (list === "bin") return <BinList />;
  return <ProjectList isViewer={isViewer} />;
}
