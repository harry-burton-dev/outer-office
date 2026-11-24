// The content area: the current screen, or the no-principals empty state for
// the screens that follow the principal switch.
import { CalendarScreen } from "@/screens/calendar-screen";
import { HomeScreen } from "@/screens/home-screen";
import { ImportScreen } from "@/screens/import-screen";
import { LogScreen } from "@/screens/log-screen";
import { PrintScreen } from "@/screens/print-screen";
import { SeriesScreen } from "@/screens/series-screen";
import { TaskListScreen } from "@/screens/task-list-screen";
import { TagsScreen } from "@/tags/tags-screen";
import { TemplatesScreen } from "@/cards/templates-screen";
import { StatsScreen } from "@/stats/stats-screen";
import { AlertsScreen } from "@/screens/alerts-screen";
import { useApp, type Screen } from "./app-state";
import { EmptyState } from "./ui";

export type TaskScreen = Extract<Screen, "inbox" | "today" | "project" | "bin">;
const TASK_SCREENS: ReadonlySet<Screen> = new Set<Screen>(["inbox", "today", "project", "bin"]);

export const isTaskScreen = (screen: Screen): screen is TaskScreen => TASK_SCREENS.has(screen);

function PrincipalScreen({ screen, principalId }: { screen: Exclude<Screen, TaskScreen | "tags" | "templates" | "stats" | "home" | "alerts">; principalId: string }) {
  if (screen === "import") return <ImportScreen />;
  if (screen === "log") return <LogScreen />;
  if (screen === "series") return <SeriesScreen />;
  if (screen === "print") return <PrintScreen key={principalId} principalId={principalId} />;
  return <CalendarScreen />;
}

export function ScreenContent() {
  const { screen, principalId } = useApp();
  if (isTaskScreen(screen)) return <TaskListScreen key={screen} list={screen} />;
  if (screen === "home") return <HomeScreen />;
  if (screen === "tags") return <TagsScreen />;
  if (screen === "templates") return <TemplatesScreen />;
  if (screen === "stats") return <StatsScreen />;
  if (screen === "alerts") return <AlertsScreen />;
  if (principalId === null) return <EmptyState title="No principals yet" body="Add them in the admin page." />;
  return <PrincipalScreen screen={screen} principalId={principalId} />;
}
