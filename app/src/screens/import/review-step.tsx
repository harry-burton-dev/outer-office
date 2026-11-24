// Step two: what applying the file would do, for a person to confirm.
import { useMemo, useState } from "react";
import { useRecords } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApp } from "@/app/app-state";
import { formatDay } from "@/domain/dates";
import { marksMostGone, storedInRange } from "@/import/diff";
import type { ImportDiff } from "@/import/types";
import { CHANGE_ROW_CAP, changeRows, changesAnything, countsLine, type PrivatePolicy } from "./import-model";

export interface ReviewStepProps {
  fileName: string;
  diff: ImportDiff;
  warnings: readonly string[];
  policy: PrivatePolicy;
  error: string;
  onApply(): void;
  onCancel(): void;
}

function ChangeTable({ diff }: { diff: ImportDiff }) {
  const { timezone } = useApp();
  const overlays = useRecords("overlays");
  const tasks = useRecords("tasks");
  const rows = useMemo(() => changeRows(diff, timezone, { overlays, tasks }), [diff, timezone, overlays, tasks]);
  const shown = rows.slice(0, CHANGE_ROW_CAP);
  return (
    <>
      <Table aria-label="Changes">
        <TableHeader>
          <TableRow>
            <TableHead>What</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Was</TableHead>
            <TableHead>Now</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((row) => (
            <TableRow key={row.key}>
              <TableCell>
                {row.kind}
                {row.officeData && <span className="text-muted-foreground"> · {row.officeData}</span>}
              </TableCell>
              <TableCell className="max-w-80 truncate">{row.subject}</TableCell>
              <TableCell>{row.was}</TableCell>
              <TableCell>{row.now}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > shown.length && <p className="text-sm text-muted-foreground">and {rows.length - shown.length} more</p>}
    </>
  );
}

function Warnings({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul aria-label="Warnings" className="flex flex-col gap-1 text-xs text-muted-foreground">
      {warnings.map((w, i) => (
        <li key={`${i} ${w}`}>{w}</li>
      ))}
    </ul>
  );
}

/** Shown when the file would mark most of the diary gone; Apply waits for the tick. */
function GoneGuard({ diff, confirmed, onConfirm }: { diff: ImportDiff; confirmed: boolean; onConfirm(value: boolean): void }) {
  const count = diff.gone.length;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/50 p-3">
      <p role="alert" className="text-sm text-destructive">
        This file would mark {count} of {storedInRange(diff)} events gone. An empty,
        partial or older export does this. Check it is the file you meant.
      </p>
      <Label>
        <Checkbox checked={confirmed} onCheckedChange={onConfirm} />
        Yes, mark {count} events gone
      </Label>
    </div>
  );
}

export function ReviewStep({ fileName, diff, warnings, policy, error, onApply, onCancel }: ReviewStepProps) {
  const { timezone } = useApp();
  const hasChanges = changesAnything(diff);
  const guarded = marksMostGone(diff);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <section aria-label="Review" className="flex flex-col gap-4">
      <p className="text-sm">
        {fileName}: {formatDay(diff.rangeStart, timezone)} to {formatDay(diff.rangeEnd, timezone)}
      </p>
      <p className="text-sm text-muted-foreground">{countsLine(diff, policy)}</p>
      {hasChanges ? <ChangeTable diff={diff} /> : <p className="text-sm">Nothing to change</p>}
      <Warnings warnings={warnings} />
      {guarded && <GoneGuard diff={diff} confirmed={confirmed} onConfirm={setConfirmed} />}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {hasChanges ? (
          <>
            <Button onClick={onApply} disabled={guarded && !confirmed}>
              Apply import
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </>
        ) : (
          <Button onClick={onCancel}>Done</Button>
        )}
      </div>
    </section>
  );
}
