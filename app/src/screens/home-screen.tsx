// Home: what changed since you last looked (OUT-58). One section per active
// principal and one for tasks offered to you, each with "Mark as seen". A
// line about a meeting or a task opens its panel.
import { useMemo } from "react";
import { useRecords } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/app/ui";
import { useApp } from "@/app/app-state";
import { usePeople } from "@/app/people";
import { useActivePrincipals } from "@/app/principals";
import { commands } from "@/domain/commands";
import { homeChanges, ME, type HomeGroup, type LogRow } from "@/domain/home";
import { kindText, valueText } from "./log/log-model";
import { logValueText, NOT_SYNCED } from "./log/log-refs";
import { useLogLookups } from "./log/use-log-lookups";
import { ErrorLine } from "./tasks/list-parts";
import { useRun } from "./tasks/use-run";
import { WatchRules } from "./home/watch-rules";

function useSubjectOf(): (row: LogRow) => string {
  const events = useRecords("events", { includeDeleted: true });
  const tasks = useRecords("tasks", { includeDeleted: true });
  return useMemo(() => {
    const subjects = new Map(events.map((e) => [e.id, e.subject ?? ""]));
    const titles = new Map(tasks.map((t) => [t.id, t.title ?? ""]));
    return (row) => (row.task ? (titles.get(row.task) ?? NOT_SYNCED) : row.event ? (subjects.get(row.event) ?? NOT_SYNCED) : (row.note ?? ""));
  }, [events, tasks]);
}

function ChangeLine({ row, subject }: { row: LogRow; subject: string }) {
  const { timezone, openPanel } = useApp();
  const lookups = useLogLookups();
  const { nameOf } = usePeople();
  const from = logValueText(row, row.from, lookups, timezone);
  const to = logValueText(row, row.to, lookups, timezone);
  const fromTo = from && to ? `${from} → ${to}` : from || to;
  const target = row.task ? { kind: "task" as const, id: row.task } : row.event ? { kind: "engagement" as const, id: row.event } : null;
  const body = (
    <>
      <span className="font-medium">{kindText(row.kind)}</span>
      <span className="truncate">{subject}</span>
      {fromTo && <span className="text-muted-foreground">{fromTo}</span>}
    </>
  );
  return (
    <li data-testid="home-change" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-2 text-sm last:border-b-0">
      {target ? (
        <button type="button" onClick={() => openPanel(target)} className="flex min-w-0 flex-wrap items-baseline gap-x-3 rounded-sm text-left outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
          {body}
        </button>
      ) : (
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">{body}</span>
      )}
      <span className="ml-auto text-xs text-muted-foreground">
        {nameOf(row.by ?? "")}, {valueText(row.at, timezone)}
      </span>
    </li>
  );
}

function ChangeGroup({ group, title }: { group: HomeGroup; title: string }) {
  const { timezone } = useApp();
  const subjectOf = useSubjectOf();
  const seen = useRun(commands.homeMarkSeen);
  const newest = group.rows[0]?.at;
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-medium">
          {title} <span className="text-muted-foreground">{group.rows.length}</span>
        </h2>
        {newest && (
          <Button variant="outline" size="sm" onClick={() => seen.run({ scope: group.scope, upTo: newest })}>
            Mark as seen
          </Button>
        )}
      </div>
      <ErrorLine error={seen.error} />
      {group.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{group.seenAt ? `Nothing new since ${valueText(group.seenAt, timezone)}.` : "Nothing new."}</p>
      ) : (
        <ul className="flex flex-col">
          {group.rows.map((row) => (
            <ChangeLine key={row.id} row={row} subject={subjectOf(row)} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function HomeScreen() {
  const { userId, now } = useApp();
  const principals = useActivePrincipals();
  const log = useRecords("log");
  const tasks = useRecords("tasks");
  const seen = useRecords("seen");
  const people = useRecords("people");
  const watchOff = people.find((p) => !p._deleted && p.userId === userId)?.watchOff;
  const groups = useMemo(
    () => homeChanges({ user: userId, log, tasks, seen, watchOff, principals, now }),
    [userId, log, tasks, seen, watchOff, principals, now],
  );
  const titleOf = (scope: string) => {
    if (scope === ME) return "Tasks for you";
    const p = principals.find((x) => x.id === scope);
    return p ? `${p.code ?? ""}${p.title ? ` · ${p.title}` : ""}` : scope;
  };
  const total = groups.reduce((sum, g) => sum + g.rows.length, 0);
  return (
    <div className="flex max-w-220 flex-col gap-6">
      <PageHeader title="Home" description="What changed since you last looked." actions={<WatchRules watchOff={watchOff} />} />
      {total === 0 && <EmptyState title="You're up to date" body="Changes made by colleagues and imports show here." />}
      {groups.map((group) => (
        <ChangeGroup key={group.scope} group={group} title={titleOf(group.scope)} />
      ))}
    </div>
  );
}
