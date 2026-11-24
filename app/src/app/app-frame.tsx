// The application frame: sidebar, top bar, conflict prompt, the current
// screen, and the roots for panels and dialogs. Render inside <AppProvider>.
import { ConflictPrompt } from "@trellis/framework";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useApp } from "./app-state";
import { AppSidebar } from "./app-sidebar";
import { PanelHost, PrivacyHost, QuickAddHost } from "./overlays";
import { ScreenContent } from "./screen-content";
import { TopBar } from "./top-bar";
import { useQuickAddKey } from "./use-quick-add-key";

export function AppFrame() {
  const { isViewer, quickAddOpen, openQuickAdd } = useApp();
  useQuickAddKey(!isViewer && !quickAddOpen, openQuickAdd);
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <div className="flex h-svh min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="px-6 pt-4 empty:hidden">
            <ConflictPrompt />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-6">
            <ScreenContent />
          </div>
        </div>
        <PanelHost />
        <QuickAddHost />
        <PrivacyHost />
      </SidebarProvider>
    </TooltipProvider>
  );
}
