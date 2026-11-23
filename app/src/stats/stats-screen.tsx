// Stats (OUT-69): simple counts for the office over a month, one row per
// principal: engagements, prep done on time, and moves in Outlook.
import { useMemo, useState } from "react";
import { useRecords } from "@trellis/framework";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApp } from "@/app/app-state";
import { useActivePrincipals } from "@/app/principals";
import { EmptyState, PageHeader } from "@/app/ui";
import { dateIn } from "@/domain/dates";
import { EMPTY_STATS, nextMonth, officeStats, totalOf, type PrincipalStats } from "@/domain/stats";

const DESCRIPTION =
  "Engagements starting this month, not counting all-day, gone or archived ones. Prep counts meetings that have started and carry cards: on time when every card was complete by the start. Moves are times Outlook moved a meeting this month.";

const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));

function prepText(row: PrincipalStats): string {
  if (row.withCards === 0) return "–";
  const late = row.prepLate > 0 ? `, ${row.prepLate} late` : "";
  return `${row.prepOnTime} of ${row.withCards}${late}`;
}

function StatsRow({ label, row, heading }: { label: string; row: PrincipalStats; heading?: boolean }) {
  return (
    <TableRow>
      <TableCell className={heading ? "font-medium" : undefined}>{label}</TableCell>
      <TableCell className="text-right tabular-nums">{row.engagements}</TableCell>
      <TableCell className="text-right tabular-nums">{prepText(row)}</TableCell>
      <TableCell className="text-right tabular-nums">{row.moves}</TableCell>
    </TableRow>
  );
}

function MonthStepper({ month, onChange }: { month: string; onChange(month: string): void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => onChange(nextMonth(month, -1))}>
        <ChevronLeft aria-hidden />
      </Button>
      <span className="w-36 text-center text-sm font-medium" aria-live="polite">{monthName(month)}</span>
      <Button variant="outline" size="icon" aria-label="Next month" onClick={() => onChange(nextMonth(month))}>
        <ChevronRight aria-hidden />
      </Button>
    </div>
  );
}

export function StatsScreen() {
  const { now, timezone } = useApp();
  const [month, setMonth] = useState(() => dateIn(now, timezone).slice(0, 7));
  const principals = useActivePrincipals();
  const events = useRecords("events");
  const overlays = useRecords("overlays");
  const cards = useRecords("cards");
  const templates = useRecords("templates");
  const log = useRecords("log");
  const stats = useMemo(
    () => officeStats({ month, timezone, now, events, overlays, cards, templates, log }),
    [month, timezone, now, events, overlays, cards, templates, log],
  );
  const rows = principals.map((p) => ({ principal: p, row: stats.get(p.id) ?? EMPTY_STATS }));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Stats" description={DESCRIPTION} actions={<MonthStepper month={month} onChange={setMonth} />} />
      {principals.length === 0 ? (
        <EmptyState title="No principals yet" body="Add them in the admin page." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Principal</TableHead>
              <TableHead className="text-right">Engagements</TableHead>
              <TableHead className="text-right">Prep on time</TableHead>
              <TableHead className="text-right">Moves</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ principal, row }) => (
              <StatsRow key={principal.id} label={principal.code || principal.title || "Principal"} row={row} />
            ))}
          </TableBody>
          {rows.length > 1 && (
            <TableFooter>
              <StatsRow label="Office" row={totalOf(rows.map((r) => r.row))} heading />
            </TableFooter>
          )}
        </Table>
      )}
    </div>
  );
}
