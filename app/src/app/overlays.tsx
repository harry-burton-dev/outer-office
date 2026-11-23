// The roots the frame owns around panel and dialog bodies: the right-hand
// sheet for the current panel, the quick add dialog, and the privacy notice.
// Each body component renders its own SheetContent or DialogContent.
import { useRecords } from "@trellis/framework";
import { Dialog } from "@/components/ui/dialog";
import { Sheet } from "@/components/ui/sheet";
import { hasAckedPrivacy } from "@/domain/selectors";
import { EngagementPanel } from "@/panels/engagement-panel";
import { NeedsActionPanel } from "@/panels/needs-action-panel";
import { TaskPanel } from "@/panels/task-panel";
import { PrivacyNotice } from "@/dialogs/privacy-notice";
import { QuickAddDialog } from "@/dialogs/quick-add-dialog";
import { useApp, type Panel } from "./app-state";
import { isTaskScreen } from "./screen-content";

function PanelBody({ panel }: { panel: Exclude<Panel, null> }) {
  if (panel.kind === "engagement") return <EngagementPanel key={panel.id} eventId={panel.id} />;
  if (panel.kind === "task") return <TaskPanel key={panel.id} taskId={panel.id} />;
  return <NeedsActionPanel />;
}

export function PanelHost() {
  const { panel, closePanel } = useApp();
  return (
    <Sheet open={panel !== null} onOpenChange={(open) => !open && closePanel()}>
      {panel && <PanelBody panel={panel} />}
    </Sheet>
  );
}

export function QuickAddHost() {
  const { quickAddOpen, closeQuickAdd } = useApp();
  return (
    <Dialog open={quickAddOpen} onOpenChange={(open) => !open && closeQuickAdd()}>
      <QuickAddDialog />
    </Dialog>
  );
}

export function PrivacyHost() {
  const { screen, userId, go } = useApp();
  const people = useRecords("people");
  const open = isTaskScreen(screen) && !hasAckedPrivacy(people, userId);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && go("calendar")}>
      <PrivacyNotice />
    </Dialog>
  );
}
