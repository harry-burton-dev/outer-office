// The content area: the current screen, or the no-principals empty state for
// the screens that follow the principal switch.
import { CalendarScreen } from "@/screens/calendar-screen";
import { ImportScreen } from "@/screens/import-screen";
import { LogScreen } from "@/screens/log-screen";
import { TaskListScreen } from "@/screens/task-list-screen";
import { useApp, type Screen } from "./app-state";
import { EmptyState } from "./ui";

export type TaskScreen = Extract<Screen, "inbox" | "today" | "project" | "bin">;
const TASK_SCREENS: ReadonlySet<Screen> = new Set<Screen>(["inbox", "today", "project", "bin"]);

export const isTaskScreen = (screen: Screen): screen is TaskScreen => TASK_SCREENS.has(screen);

function PrincipalScreen({ screen }: { screen: Exclude<Screen, TaskScreen> }) {
  if (screen === "import") return <ImportScreen />;
  if (screen === "log") return <LogScreen />;
  return <CalendarScreen />;
}

export function ScreenContent() {
  const { screen, principalId } = useApp();
  if (isTaskScreen(screen)) return <TaskListScreen key={screen} list={screen} />;
  if (principalId === null) return <EmptyState title="No principals yet" body="Add them in the admin page." />;
  return <PrincipalScreen screen={screen} />;
}
