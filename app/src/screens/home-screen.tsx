// Home (OUT-86, v0.3 brief 8): one stream panel per active principal, plus
// "For you". Each opens with the watching line, then the needs-you lane, then
// for information with "Mark all seen". Updates come from useUpdates, the
// same source Needs action reads.
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/app/ui";
import { useApp } from "@/app/app-state";
import { useActivePrincipals } from "@/app/principals";
import { onSurface, useUpdates } from "@/app/updates-data";
import { useOffice } from "@/app/frame-data";
import { commands } from "@/domain/commands";
import { ME } from "@/domain/home";
import { RULES } from "@/domain/rules";
import type { UpdateGroup } from "@/domain/updates";
import { formatTime } from "@/domain/dates";
import { ErrorLine } from "./tasks/list-parts";
import { useRun } from "./tasks/use-run";
import { UpdateRow } from "./home/update-row";

interface StreamProps {
  group: UpdateGroup;
  title: string;
  /** "Watching …" for a principal; none for "For you". */
  watching?: { line: string; warning: boolean };
}

function Lane({ title, children, count }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">{title} <span>{count}</span></h3>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

function Stream({ group, title, watching }: StreamProps) {
  const { isViewer } = useApp();
  const seen = useRun(commands.homeMarkSeen);
  const needs = group.needs.filter((u) => onSurface(u, "home"));
  const info = group.info.filter((u) => onSurface(u, "home"));
  const newest = info.map((u) => u.at).sort().pop();
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-medium">{title}</h2>
        {newest && (
          <Button variant="outline" size="sm" onClick={() => seen.run({ scope: group.scope, upTo: newest })}>Mark all seen</Button>
        )}
      </div>
      {watching && (
        <p data-testid="watching" className={watching.warning ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>{watching.line}</p>
      )}
      <ErrorLine error={seen.error} />
      <Lane title="Needs you" count={needs.length}>{needs.map((u) => <UpdateRow key={u.key} update={u} readOnly={isViewer} />)}</Lane>
      <Lane title="For information" count={info.length}>{info.map((u) => <UpdateRow key={u.key} update={u} readOnly={isViewer} />)}</Lane>
      {needs.length === 0 && info.length === 0 && <p className="text-sm text-muted-foreground">Nothing new.</p>}
    </section>
  );
}

export function HomeScreen() {
  const { timezone, go } = useApp();
  const office = useOffice();
  const principals = useActivePrincipals();
  const { groups, settings, lastSync } = useUpdates();
  const rulesOn = RULES.filter((r) => settings.get(r.id)?.on).length;
  const watchingOf = (scope: string, code: string, group: UpdateGroup) => {
    const last = lastSync.get(scope);
    const late = group.needs.some((u) => u.cause === "sync-health");
    const sync = office?.automate ? ` · last sync ${last ? formatTime(last, timezone) : "never"}${late ? " (late or can't be used)" : ""}` : "";
    return { line: `Watching ${code}'s diary${sync} · ${rulesOn} rules on`, warning: late };
  };
  const total = groups.reduce((n, g) => n + g.needs.length + g.info.length, 0);
  return (
    <div className="flex max-w-220 flex-col gap-6">
      <PageHeader title="Home" description="What needs you, and what changed since you last looked." actions={<Button variant="outline" onClick={() => go("alerts")}>Alerts</Button>} />
      {total === 0 && <EmptyState title="You're up to date" body="Colleagues' changes, syncs and anything that needs you show here." />}
      {groups.map((group) => {
        if (group.scope === ME) return <Stream key={ME} group={group} title="For you" />;
        const p = principals.find((x) => x.id === group.scope);
        const code = p?.code ?? group.scope;
        const title = p ? `${code}${p.title ? ` · ${p.title}` : ""}` : group.scope;
        return <Stream key={group.scope} group={group} title={title} watching={watchingOf(group.scope, code, group)} />;
      })}
    </div>
  );
}
