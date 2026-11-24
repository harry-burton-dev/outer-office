// The signed-in user's updates (OUT-86): one source for Home's stream panels,
// Needs action and its badge. Gathers what updatesFor reads.
import { useMemo } from "react";
import { useRecords } from "@trellis/framework";
import { settingsFor, type RuleSetting } from "@/domain/rules";
import { updatesFor, type Update, type UpdateGroup } from "@/domain/updates";
import { useDiaryInbox } from "@/automate/diary-inbox-state";
import { useApp } from "./app-state";
import { useOffice } from "./frame-data";
import { useActivePrincipals } from "./principals";

export interface Updates {
  groups: UpdateGroup[];
  settings: ReadonlyMap<string, RuleSetting>;
  /** The newest sync each principal is known to have had. */
  lastSync: ReadonlyMap<string, string>;
}

/** The newest import per principal, or a sync file still waiting to apply when that is newer. */
function lastSyncOf(imports: readonly { _deleted: boolean; principal?: string; at?: string }[], pending: ReadonlyMap<string, string>): Map<string, string> {
  const last = new Map<string, string>();
  const take = (principal: string, at: string) => { if (at > (last.get(principal) ?? "")) last.set(principal, at); };
  for (const row of imports) if (!row._deleted && row.principal) take(row.principal, row.at ?? "");
  for (const [principal, at] of pending) take(principal, at);
  return last;
}

export function useUpdates(): Updates {
  const { userId, now, timezone, isViewer } = useApp();
  const office = useOffice();
  const principals = useActivePrincipals();
  const log = useRecords("log");
  const tasks = useRecords("tasks");
  const events = useRecords("events");
  const overlays = useRecords("overlays");
  const seen = useRecords("seen");
  const updateState = useRecords("updateState");
  const ruleSettings = useRecords("ruleSettings");
  const people = useRecords("people");
  const imports = useRecords("imports");
  const { entries } = useDiaryInbox();
  const watchOff = people.find((p) => !p._deleted && p.userId === userId)?.watchOff;
  return useMemo(() => {
    const idOfCode = new Map(principals.map((p) => [p.code ?? "", p.id]));
    const pending = new Map<string, string>();
    const heldBack = new Map<string, string>();
    for (const e of entries) {
      const id = idOfCode.get(e.ok ? e.update.principal : e.principal);
      if (!id) continue;
      if (e.ok) pending.set(id, e.update.generatedAt);
      else if (!isViewer) heldBack.set(id, e.reason);
    }
    const lastSync = lastSyncOf(imports, pending);
    const settings = settingsFor(userId, ruleSettings, watchOff);
    const groups = updatesFor({
      user: userId, now, timezone, dayStart: office?.dayStart || "08:00", dayEnd: office?.dayEnd || "18:00",
      principals, log, tasks, events, overlays, seen, updateState, settings,
      sync: { on: office?.automate === true, last: lastSync, heldBack },
    });
    return { groups, settings, lastSync };
  }, [userId, now, timezone, isViewer, office, principals, log, tasks, events, overlays, seen, updateState, ruleSettings, watchOff, imports, entries]);
}

/** Whether an update shows on a surface, by the user's setting for each rule it matched. */
export const onSurface = (u: Update, surface: "home" | "needs" | "badge", settings: ReadonlyMap<string, RuleSetting>): boolean =>
  u.rules.some((r) => settings.get(r)?.surfaces.includes(surface));

/** The chosen principal's needs-you lane, as Needs action shows it. */
export function useNeedsYou(): { updates: Update[]; badge: number } {
  const { principalId } = useApp();
  const { groups, settings } = useUpdates();
  return useMemo(() => {
    const needs = groups.find((g) => g.scope === principalId)?.needs ?? [];
    return {
      updates: needs.filter((u) => onSurface(u, "needs", settings)),
      badge: needs.filter((u) => onSurface(u, "badge", settings)).length,
    };
  }, [groups, settings, principalId]);
}
