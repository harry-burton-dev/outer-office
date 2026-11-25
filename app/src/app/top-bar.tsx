// The top bar: the sidebar toggle, Add task (the primary button on the task
// screens, outline elsewhere so a screen keeps one primary of its own), Needs
// action with its count, the sync status, light or dark, and the signed-in
// user, whose menu opens Alerts (OUT-86).
import { Plus } from "lucide-react";
import { HealthIndicator, useSession } from "@trellis/framework";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useApp } from "./app-state";
import { ThemeToggle } from "./theme";
import { useNeedsYou } from "./updates-data";
import { usePeople } from "./people";
import { isTaskScreen } from "./screen-content";

function NeedsActionButton() {
  const { openPanel } = useApp();
  const count = useNeedsYou().badge;
  return (
    <Button variant="outline" onClick={() => openPanel({ kind: "needs-action" })}>
      Needs action{" "}
      <Badge variant="secondary">{count}</Badge>
    </Button>
  );
}

export function TopBar() {
  const { isViewer, openQuickAdd, screen, go } = useApp();
  const { user } = useSession();
  const people = usePeople();
  const name = people.list.some((u) => u.id === user.id) ? people.nameOf(user.id) : user.name;
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 print:hidden">
      <SidebarTrigger />
      {isViewer ? (
        <span className="text-sm text-muted-foreground">Read-only view</span>
      ) : (
        <Button variant={isTaskScreen(screen) ? "default" : "outline"} onClick={openQuickAdd} aria-keyshortcuts="Q">
          <Plus aria-hidden />
          Add task
        </Button>
      )}
      <NeedsActionButton />
      <div className="ml-auto flex min-w-0 items-center gap-4">
        <HealthIndicator compact />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="max-w-48 truncate" />}>{name}</DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => go("alerts")}>Alerts</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
