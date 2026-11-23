// The top bar: the sidebar toggle, Add task (the one primary button), Needs
// action with its count, the sync status and the signed-in user.
import { Plus } from "lucide-react";
import { HealthIndicator, useSession } from "@trellis/framework";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useApp } from "./app-state";
import { needsActionCount, useNeedsAction } from "./frame-data";

function NeedsActionButton() {
  const { openPanel } = useApp();
  const count = needsActionCount(useNeedsAction());
  return (
    <Button variant="outline" aria-label={`Needs action ${count}`} onClick={() => openPanel({ kind: "needs-action" })}>
      Needs action
      <Badge variant="secondary">{count}</Badge>
    </Button>
  );
}

export function TopBar() {
  const { isViewer, openQuickAdd } = useApp();
  const { user } = useSession();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      {isViewer ? (
        <span className="text-sm text-muted-foreground">Read-only view</span>
      ) : (
        <Button onClick={openQuickAdd} aria-keyshortcuts="Q">
          <Plus aria-hidden />
          Add task
        </Button>
      )}
      <NeedsActionButton />
      <div className="ml-auto flex min-w-0 items-center gap-4">
        <HealthIndicator compact />
        <span className="truncate text-sm">{user.name}</span>
      </div>
    </header>
  );
}
