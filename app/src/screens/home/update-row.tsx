// One update on Home or in Needs action (OUT-86): what it says, Open, and the
// lane's actions. Needs you: snooze only. For information: dismiss, snooze, pin.
import { useMemo } from "react";
import { useRecords } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApp } from "@/app/app-state";
import { usePeople } from "@/app/people";
import { commands } from "@/domain/commands";
import type { Update } from "@/domain/updates";
import { kindText, valueText } from "@/screens/log/log-model";
import { ErrorLine } from "@/screens/tasks/list-parts";
import { useRun } from "@/screens/tasks/use-run";

const HOUR_MS = 3_600_000;
const SNOOZES = [
  { label: "For an hour", ms: HOUR_MS },
  { label: "Until tomorrow", ms: 24 * HOUR_MS },
  { label: "For a week", ms: 7 * 24 * HOUR_MS },
] as const;

const SYNC_RULES = new Set(["sync-late", "sync-held-back", "sync-applied"]);

export function useSubjects(): { event(id: string): string; task(id: string): string } {
  const events = useRecords("events", { includeDeleted: true });
  const tasks = useRecords("tasks", { includeDeleted: true });
  return useMemo(() => {
    const subjects = new Map(events.map((e) => [e.id, e.subject || "Untitled"]));
    const titles = new Map(tasks.map((t) => [t.id, t.title || "Untitled"]));
    return { event: (id) => subjects.get(id) ?? "Not synced yet", task: (id) => titles.get(id) ?? "Not synced yet" };
  }, [events, tasks]);
}

/** The update's line, in words. */
export function updateText(u: Update, subjects: ReturnType<typeof useSubjects>, zone: string, today: string): { what: string; about: string; detail: string } {
  const about = u.event ? subjects.event(u.event) : u.task ? subjects.task(u.task) : "";
  const when = (v: string | undefined) => valueText(v, zone);
  switch (u.cause) {
    case "task-overdue": return { what: u.at < today ? "Overdue" : "Due today", about, detail: u.at ? `due ${when(u.at)}` : "" };
    case "task-offered": return { what: "Offered to you", about, detail: "" };
    case "prep-due": return { what: "Prep needed", about, detail: when(u.at) };
    case "gone-no-reason": return { what: "Gone from Outlook with office data", about, detail: "archive it with a reason" };
    case "sync-late": return { what: "Diary sync is late", about: "", detail: u.at ? `last ${when(u.at)}` : "no sync yet" };
    case "sync-held-back": return { what: "Diary sync held back", about: "", detail: u.note ?? "" };
    default: break;
  }
  if (u.key.startsWith("run:")) return { what: u.note || "Sync", about: "", detail: u.members.length > 0 ? `${u.members.length} meetings` : "" };
  if (u.key.startsWith("series:")) {
    const first = u.members[0];
    return { what: u.kinds.map(kindText).join(", "), about: first?.event ? subjects.event(first.event) : "", detail: `${u.members.length} meetings in the series` };
  }
  const fromTo = u.from && u.to ? `${when(u.from)} → ${when(u.to)}` : "";
  return { what: u.kinds.map(kindText).join(", "), about, detail: fromTo || (u.kinds.includes("changed") ? (u.note ?? "") : "") };
}

function Actions({ update }: { update: Update }) {
  const set = useRun(commands.updateSet);
  const at = update.at || undefined;
  const snooze = (ms: number) => set.run({ key: update.key, state: "snoozed", until: new Date(Date.now() + ms).toISOString() });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>Snooze</DropdownMenuTrigger>
        <DropdownMenuContent>
          {SNOOZES.map((s) => <DropdownMenuItem key={s.label} onClick={() => snooze(s.ms)}>{s.label}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      {update.key.startsWith("own:") && (
        <Button variant="ghost" size="sm" onClick={() => set.run({ key: update.key, state: "seen", ...(at ? { at } : {}) })}>Done</Button>
      )}
      {update.lane === "info" && (
        <>
          <Button variant="ghost" size="sm" onClick={() => set.run({ key: update.key, state: update.pinned ? "clear" : "pinned", ...(at ? { at } : {}) })}>
            {update.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => set.run({ key: update.key, state: "dismissed", ...(at ? { at } : {}) })}>Dismiss</Button>
        </>
      )}
      <ErrorLine error={set.error} />
    </>
  );
}

export function UpdateRow({ update, readOnly = false }: { update: Update; readOnly?: boolean }) {
  const { timezone, today, openPanel, closePanel, go } = useApp();
  const { nameOf } = usePeople();
  const subjects = useSubjects();
  const { what, about, detail } = updateText(update, subjects, timezone, today);
  const open = update.task
    ? () => openPanel({ kind: "task", id: update.task ?? "" })
    : update.event
      ? () => openPanel({ kind: "engagement", id: update.event ?? "" })
      : (SYNC_RULES.has(update.cause ?? "") || update.rules.includes("sync-applied"))
        ? () => { closePanel(); go("import"); }
        : undefined;
  const by = update.lane === "info" ? [...new Set(update.rows.map((r) => r.by ?? "").filter(Boolean))].map(nameOf).join(", ") : "";
  const credit = [
    by && `${by}${update.at ? `, ${valueText(update.at, timezone)}` : ""}`,
    update.dealtWith && `${nameOf(update.dealtWith.by)} dealt with this at ${valueText(update.dealtWith.at, timezone)}`,
  ].filter(Boolean).join(" · ");
  return (
    <li data-testid="update" data-key={update.key} className="flex flex-col gap-1 border-b py-2 text-sm last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{what}</span>
        {about && <span className="truncate">{about}</span>}
        {detail && <span className="text-muted-foreground">{detail}</span>}
        {update.pinned && <span className="text-xs text-muted-foreground">Pinned</span>}
        {update.coveringFor && <span className="text-xs text-muted-foreground">Covering for {nameOf(update.coveringFor)}</span>}
        <span className="ml-auto flex items-center gap-1">
          {open && <Button variant="outline" size="sm" onClick={open}>Open</Button>}
          {!readOnly && <Actions update={update} />}
        </span>
      </div>
      {credit && <p className="text-xs text-muted-foreground">{credit}</p>}
      {update.members.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Show the meetings</summary>
          <ul className="flex flex-col pl-3">
            {update.members.map((m) => {
              const t = updateText(m, subjects, timezone, today);
              return (
                <li key={m.key}>
                  <button type="button" className="hover:underline" onClick={() => m.event && openPanel({ kind: "engagement", id: m.event })}>
                    {t.what} · {t.about} {t.detail && <span className="text-muted-foreground">{t.detail}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </li>
  );
}
