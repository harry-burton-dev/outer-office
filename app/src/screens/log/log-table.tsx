// The log as a table. A row about an event or a task opens its panel.
import { useMemo } from "react";
import { useRecords } from "@trellis/framework";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApp } from "@/app/app-state";
import { usePeople } from "@/app/people";
import { areaText, kindText, valueText, type LogRow } from "./log-model";
import { logValueText, NOT_SYNCED, type LogLookups } from "./log-refs";
import { useLogLookups } from "./use-log-lookups";

export interface LogTableProps {
  rows: readonly LogRow[];
}

function useSubjects(): (row: LogRow) => string {
  const events = useRecords("events", { includeDeleted: true });
  const tasks = useRecords("tasks", { includeDeleted: true });
  return useMemo(() => {
    const subjects = new Map(events.map((e) => [e.id, e.subject ?? ""]));
    const titles = new Map(tasks.map((t) => [t.id, t.title ?? ""]));
    return (row: LogRow) => {
      if (row.event) return subjects.get(row.event) ?? NOT_SYNCED;
      if (row.task) return titles.get(row.task) ?? NOT_SYNCED;
      return "";
    };
  }, [events, tasks]);
}

interface LogLineProps {
  row: LogRow;
  subject: string;
  who: string;
  lookups: LogLookups;
}

function LogLine({ row, subject, who, lookups }: LogLineProps) {
  const { timezone, openPanel } = useApp();
  const target = row.event ? { kind: "engagement" as const, id: row.event } : row.task ? { kind: "task" as const, id: row.task } : null;
  const open = target ? () => openPanel(target) : undefined;
  return (
    <TableRow onClick={open} className={target ? "cursor-pointer" : undefined}>
      <TableCell>{valueText(row.at, timezone)}</TableCell>
      <TableCell>{who}</TableCell>
      <TableCell>{areaText(row.area)}</TableCell>
      <TableCell>{kindText(row.kind)}</TableCell>
      <TableCell className="max-w-64 truncate">
        {target ? (
          <button type="button" className="max-w-full truncate rounded-sm text-left outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
            {subject}
          </button>
        ) : (
          subject
        )}
      </TableCell>
      <TableCell>{logValueText(row, row.from, lookups, timezone)}</TableCell>
      <TableCell>{logValueText(row, row.to, lookups, timezone)}</TableCell>
      <TableCell className="max-w-64 truncate">{row.note ?? ""}</TableCell>
    </TableRow>
  );
}

export function LogTable({ rows }: LogTableProps) {
  const subjectOf = useSubjects();
  const lookups = useLogLookups();
  const { nameOf } = usePeople();
  return (
    <Table aria-label="Log">
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Who</TableHead>
          <TableHead>Area</TableHead>
          <TableHead>What</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>From</TableHead>
          <TableHead>To</TableHead>
          <TableHead>Note</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <LogLine key={row.id} row={row} subject={subjectOf(row)} who={row.by ? nameOf(row.by) : ""} lookups={lookups} />
        ))}
      </TableBody>
    </Table>
  );
}
