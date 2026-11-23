// This principal's past imports, newest first.
import { useMemo } from "react";
import { useRecords } from "@trellis/framework";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApp } from "@/app/app-state";
import { formatDay } from "@/domain/dates";
import { whenText } from "./import-model";

export interface ImportHistoryProps {
  principal: string;
}

const dayOf = (iso: string | undefined, zone: string) => (iso && !Number.isNaN(Date.parse(iso)) ? formatDay(iso, zone) : "");

export function ImportHistory({ principal }: ImportHistoryProps) {
  const { timezone } = useApp();
  const imports = useRecords("imports");
  const rows = useMemo(
    () => imports.filter((r) => r.principal === principal).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "") || a.id.localeCompare(b.id)),
    [imports, principal],
  );
  return (
    <section aria-labelledby="import-history" className="flex flex-col gap-2">
      <h2 id="import-history" className="text-base font-medium">
        History
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No imports yet.</p>
      ) : (
        <Table aria-label="Import history">
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Range</TableHead>
              <TableHead>Added</TableHead>
              <TableHead>Changed</TableHead>
              <TableHead>Gone</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{whenText({ start: r.at ?? "", allDay: false }, timezone)}</TableCell>
                <TableCell>{r.by ?? ""}</TableCell>
                <TableCell>
                  {dayOf(r.rangeStart, timezone)} to {dayOf(r.rangeEnd, timezone)}
                </TableCell>
                <TableCell>{r.added ?? 0}</TableCell>
                <TableCell>{r.changed ?? 0}</TableCell>
                <TableCell>{r.gone ?? 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
