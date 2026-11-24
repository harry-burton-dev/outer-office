// Series (OUT-87): the chosen principal's recurring meetings, each with its
// next occurrence, count, exceptions, health, hours a month and end date.
// A series opens to its occurrences; each occurrence opens the engagement.
import { useMemo, useState } from "react";
import { useRecords } from "@trellis/framework";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApp } from "@/app/app-state";
import { EmptyState, PageHeader } from "@/app/ui";
import { clashes } from "@/domain/clashes";
import { formatDay, formatTime } from "@/domain/dates";
import { healthText, seriesFor, standingClashes, type OccurrenceState, type Series, type StandingClash } from "@/domain/series";

const DESCRIPTION =
  "Recurring meetings from Outlook, with those still to come first. Health looks at the last 8 occurrences. Hours a month spread the series' time over the weeks it runs.";

const STATE_LABEL: Record<Exclude<OccurrenceState, "as-planned">, string> = { moved: "Moved", cancelled: "Cancelled", cut: "Cut short" };

const when = (iso: string | undefined, zone: string) => (iso ? `${formatDay(iso, zone)} ${formatTime(iso, zone)}` : "–");
const hours = (n: number) => (n === 0 ? "–" : `${Math.round(n * 10) / 10} h`);

function Occurrences({ series }: { series: Series }) {
  const { timezone, now, openPanel } = useApp();
  return (
    <ul className="flex flex-col gap-1 py-1 pl-8" aria-label={`Occurrences of ${series.subject || "this series"}`}>
      {series.occurrences.map(({ event, state }) => (
        <li key={event.id}>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
            onClick={() => openPanel({ kind: "engagement", id: event.id })}
          >
            <span className={`tabular-nums ${(event.start ?? "") < now ? "text-muted-foreground" : ""}`}>{when(event.start, timezone)}</span>
            {state === "moved" && <span className="text-muted-foreground">from {when(event.recurrenceId, timezone)}</span>}
            {state !== "as-planned" && <Badge variant={state === "moved" ? "secondary" : "outline"}>{STATE_LABEL[state]}</Badge>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function StandingClashes({ found }: { found: readonly StandingClash[] }) {
  return (
    <section aria-label="Standing clashes" className="rounded-md border border-destructive/40 p-3">
      <h2 className="pb-1 text-sm font-medium">Standing clashes</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {found.map((c) => (
          <li key={c.key}>
            {c.a.subject || "(no subject)"} clashes with {c.b.subject || "(no subject)"} on {c.clashing} of its {c.a.count} occurrences
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeriesRow({ series, open, onToggle }: { series: Series; open: boolean; onToggle(): void }) {
  const { timezone } = useApp();
  const Chevron = open ? ChevronDown : ChevronRight;
  const name = series.subject || "(no subject)";
  return (
    <>
      <TableRow>
        <TableCell>
          <button type="button" className="flex items-center gap-1 text-left font-medium" aria-expanded={open} onClick={onToggle}>
            <Chevron aria-hidden className="size-4 shrink-0" />
            {name}
          </button>
        </TableCell>
        <TableCell className="text-muted-foreground">Repeats</TableCell>
        <TableCell className="tabular-nums">{when(series.next?.start, timezone)}</TableCell>
        <TableCell className="text-right tabular-nums">{series.count}</TableCell>
        <TableCell className="text-right tabular-nums">{series.exceptions}</TableCell>
        <TableCell>{healthText(series.health) || "–"}</TableCell>
        <TableCell className="text-right tabular-nums">{hours(series.hoursPerMonth)}</TableCell>
        <TableCell className="tabular-nums">{series.end ? formatDay(series.end, timezone) : "–"}</TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={8}>
            <Occurrences series={series} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function SeriesScreen() {
  const { principalId, now, timezone } = useApp();
  const events = useRecords("events");
  const overlays = useRecords("overlays");
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const series = useMemo(() => (principalId === null ? [] : seriesFor(events, principalId, now)), [events, principalId, now]);
  const standing = useMemo(() => standingClashes(series, clashes(events, overlays, timezone)), [series, events, overlays, timezone]);
  const toggle = (key: string) => setOpen((was) => {
    const next = new Set(was);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Series" description={DESCRIPTION} />
      {standing.length > 0 && <StandingClashes found={standing} />}
      {series.length === 0 ? (
        <EmptyState title="No recurring meetings" body="Series appear here once an import or the diary sync brings in a recurring meeting." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Series</TableHead>
              <TableHead>Pattern</TableHead>
              <TableHead>Next</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Exceptions</TableHead>
              <TableHead>Health</TableHead>
              <TableHead className="text-right">Hours a month</TableHead>
              <TableHead>Ends</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {series.map((s) => (
              <SeriesRow key={s.key} series={s} open={open.has(s.key)} onToggle={() => toggle(s.key)} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
