// The app's one context: the current screen, the chosen principal, the open
// panel and quick add, and who is signed in, with the office's zone and clock.
// Everything is kept in memory; nothing here is synced.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { useRecord, useRecords, useSession } from "@trellis/framework";
import { OFFICE_ID } from "@/domain/commands";
import { todayIn } from "@/domain/dates";
import { isViewer as isViewerIn } from "@/domain/selectors";
import { resolvePrincipal, useActivePrincipals } from "./principals";

export type Screen = "calendar" | "import" | "log" | "inbox" | "today" | "project" | "bin";
export type Panel =
  | { kind: "engagement"; id: string }
  | { kind: "task"; id: string }
  | { kind: "needs-action" }
  | null;

export interface AppContextValue {
  screen: Screen;
  go(screen: Screen): void;
  /** The chosen principal's record id, or null when there are none. */
  principalId: string | null;
  choosePrincipal(id: string): void;
  panel: Panel;
  openPanel(panel: Exclude<Panel, null>): void;
  closePanel(): void;
  quickAddOpen: boolean;
  openQuickAdd(): void;
  closeQuickAdd(): void;
  /** The signed-in user's id (from useSession). */
  userId: string;
  /** people.mode === "viewer" for this user. */
  isViewer: boolean;
  /** office.timezone, or "Europe/London" until an office record exists. */
  timezone: string;
  /** ISO UTC, refreshed every minute. */
  now: string;
  /** YYYY-MM-DD in the office zone. */
  today: string;
}

export const DEFAULT_TIMEZONE = "Europe/London";
const MINUTE_MS = 60_000;

const AppContext = createContext<AppContextValue | null>(null);

function useNow(): string {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function useTimezone(): string {
  const office = useRecord("office", OFFICE_ID);
  return (!office?._deleted && office?.timezone) || DEFAULT_TIMEZONE;
}

interface Navigation {
  screen: Screen;
  go(screen: Screen): void;
  panel: Panel;
  openPanel(panel: Exclude<Panel, null>): void;
  closePanel(): void;
  quickAddOpen: boolean;
  openQuickAdd(): void;
  closeQuickAdd(): void;
}

function useNavigation(): Navigation {
  const [screen, go] = useState<Screen>("calendar");
  const [panel, setPanel] = useState<Panel>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const openPanel = useCallback((next: Exclude<Panel, null>) => setPanel(next), []);
  const closePanel = useCallback(() => setPanel(null), []);
  const openQuickAdd = useCallback(() => setQuickAddOpen(true), []);
  const closeQuickAdd = useCallback(() => setQuickAddOpen(false), []);
  return useMemo(
    () => ({ screen, go, panel, openPanel, closePanel, quickAddOpen, openQuickAdd, closeQuickAdd }),
    [screen, panel, quickAddOpen, openPanel, closePanel, openQuickAdd, closeQuickAdd],
  );
}

export function AppProvider({ children }: { children: ReactNode }): ReactElement {
  const { user } = useSession();
  const people = useRecords("people");
  const principals = useActivePrincipals();
  const [chosen, setChosen] = useState<string | null>(null);
  const navigation = useNavigation();
  const timezone = useTimezone();
  const now = useNow();
  const principalId = resolvePrincipal(principals, chosen);
  const isViewer = isViewerIn(people, user.id);

  const value = useMemo<AppContextValue>(
    () => ({ ...navigation, principalId, choosePrincipal: setChosen, userId: user.id, isViewer, timezone, now, today: todayIn(timezone, now) }),
    [navigation, principalId, user.id, isViewer, timezone, now],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const app = useContext(AppContext);
  if (!app) throw new Error("useApp must be inside <AppProvider>");
  return app;
}
