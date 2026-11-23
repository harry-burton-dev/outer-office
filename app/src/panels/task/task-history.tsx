// The task's log rows, newest first, read-only.
import { useMemo } from "react";
import { useRecords, type RowOf } from "@trellis/framework";
import { useApp } from "@/app/app-state";
import { usePeople } from "@/app/people";
import { DateText, TimeText } from "@/app/ui";
import { logValueText, type LogLookups } from "@/screens/log/log-refs";
import { useLogLookups } from "@/screens/log/use-log-lookups";

type LogRow = RowOf<"log">;

export interface TaskHistoryProps {
  taskId: string;
}

const newestFirst = (a: LogRow, b: LogRow) => (b.at ?? "").localeCompare(a.at ?? "") || b.id.localeCompare(a.id);

interface ChangeProps {
  row: LogRow;
  lookups: LogLookups;
}

function Change({ row, lookups }: ChangeProps) {
  const { timezone } = useApp();
  const from = logValueText(row, row.from, lookups, timezone);
  const to = logValueText(row, row.to, lookups, timezone);
  if (from === "" && to === "") return null;
  return <span className="text-muted-foreground"> {from || "none"} → {to || "none"}</span>;
}

export function TaskHistory({ taskId }: TaskHistoryProps) {
  const rows = useRecords("log", { where: { task: taskId } });
  const sorted = useMemo(() => [...rows].sort(newestFirst), [rows]);
  const lookups = useLogLookups();
  const { nameOf } = usePeople();
  return (
    <section aria-label="History" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">History</h3>
      {sorted.length === 0 ? <p className="text-xs text-muted-foreground">No history yet</p> : (
        <ol className="flex flex-col gap-1 text-xs">
          {sorted.map((row) => (
            <li key={row.id} data-testid="history-row">
              <span className="text-muted-foreground">
                {row.at && <><DateText value={row.at} /> <TimeText value={row.at} /></>} · {row.by ? nameOf(row.by) : "someone"} ·{" "}
              </span>
              <span>{row.note || row.kind || "changed"}</span>
              <Change row={row} lookups={lookups} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
