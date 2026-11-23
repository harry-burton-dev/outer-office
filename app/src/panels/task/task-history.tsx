// The task's log rows, newest first, read-only.
import { useMemo } from "react";
import { useRecords, type RowOf } from "@trellis/framework";
import { DateText, TimeText } from "@/app/ui";

type LogRow = RowOf<"log">;

export interface TaskHistoryProps {
  taskId: string;
}

const newestFirst = (a: LogRow, b: LogRow) => (b.at ?? "").localeCompare(a.at ?? "") || b.id.localeCompare(a.id);

function Change({ row }: { row: LogRow }) {
  const from = row.from ?? "";
  const to = row.to ?? "";
  if (from === "" && to === "") return null;
  return <span className="text-muted-foreground"> {from || "none"} → {to || "none"}</span>;
}

export function TaskHistory({ taskId }: TaskHistoryProps) {
  const rows = useRecords("log", { where: { task: taskId } });
  const sorted = useMemo(() => [...rows].sort(newestFirst), [rows]);
  return (
    <section aria-label="History" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">History</h3>
      {sorted.length === 0 ? <p className="text-xs text-muted-foreground">No history yet</p> : (
        <ol className="flex flex-col gap-1 text-xs">
          {sorted.map((row) => (
            <li key={row.id} data-testid="history-row">
              <span className="text-muted-foreground">
                {row.at && <><DateText value={row.at} /> <TimeText value={row.at} /></>} · {row.by || "someone"} ·{" "}
              </span>
              <span>{row.note || row.kind || "changed"}</span>
              <Change row={row} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
