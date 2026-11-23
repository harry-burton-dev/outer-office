// The left navigation: the app name, the principal switch, the principal's
// screens (labelled with its code), then the task lists.
import type { LucideIcon } from "lucide-react";
import { CalendarDays, CalendarCheck, FolderOpen, Inbox, ScrollText, Trash2, Upload } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useApp, type Screen } from "./app-state";
import { APP_NAME, useOffice, useSharedProject } from "./frame-data";
import { useActivePrincipals } from "./principals";
import { PrincipalSwitch } from "./principal-switch";

interface NavItem {
  screen: Screen;
  label: string;
  icon: LucideIcon;
}

const PRINCIPAL_ITEMS: readonly NavItem[] = [
  { screen: "calendar", label: "Calendar", icon: CalendarDays },
  { screen: "import", label: "Import", icon: Upload },
  { screen: "log", label: "Log", icon: ScrollText },
];

interface NavGroupProps {
  label: string;
  items: readonly NavItem[];
}

function NavGroup({ label, items }: NavGroupProps) {
  const { screen, go } = useApp();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = item.screen === screen;
            return (
              <SidebarMenuItem key={item.screen}>
                <SidebarMenuButton isActive={active} aria-current={active ? "page" : undefined} tooltip={item.label} onClick={() => go(item.screen)}>
                  <item.icon aria-hidden />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function useTaskItems(): NavItem[] {
  const project = useSharedProject();
  return [
    { screen: "inbox", label: "Inbox", icon: Inbox },
    { screen: "today", label: "Today", icon: CalendarCheck },
    ...(project ? [{ screen: "project" as const, label: project.name || "Project", icon: FolderOpen }] : []),
    { screen: "bin", label: "Bin", icon: Trash2 },
  ];
}

export function AppSidebar() {
  const { principalId } = useApp();
  const office = useOffice();
  const principals = useActivePrincipals();
  const taskItems = useTaskItems();
  const chosen = principals.find((p) => p.id === principalId);
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <p className="truncate px-2 py-1 text-base font-medium group-data-[collapsible=icon]:hidden">{office?.name || APP_NAME}</p>
        <PrincipalSwitch />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main">
          <NavGroup label={chosen?.code ?? "Diary"} items={PRINCIPAL_ITEMS} />
          <NavGroup label="Tasks" items={taskItems} />
        </nav>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
