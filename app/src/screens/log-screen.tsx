// Log: what happened for the chosen principal, newest first, filtered by area.
// Read-only for everyone. Shows 200 rows at a time.
import { useMemo, useState } from "react";
import { useRecords } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, PageHeader } from "@/app/ui";
import { useApp } from "@/app/app-state";
import { AREAS, logRowsFor, PAGE_SIZE, type AreaFilter } from "./log/log-model";
import { LogTable } from "./log/log-table";

interface AreaSelectProps {
  value: AreaFilter;
  onChange(area: AreaFilter): void;
}

const isArea = (value: unknown): value is AreaFilter => AREAS.some((a) => a.value === value);

function AreaSelect({ value, onChange }: AreaSelectProps) {
  return (
    <Select items={AREAS} value={value} onValueChange={(next: unknown) => isArea(next) && onChange(next)}>
      <SelectTrigger aria-label="Area" className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AREAS.map((area) => (
          <SelectItem key={area.value} value={area.value}>
            {area.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LogScreen() {
  const { principalId } = useApp();
  const log = useRecords("log");
  const [area, setArea] = useState<AreaFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const rows = useMemo(() => (principalId === null ? [] : logRowsFor(log, principalId, area)), [log, principalId, area]);
  const hasAny = useMemo(() => principalId !== null && logRowsFor(log, principalId, "all").length > 0, [log, principalId]);
  const chooseArea = (next: AreaFilter) => {
    setArea(next);
    setLimit(PAGE_SIZE);
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Log" actions={<AreaSelect value={area} onChange={chooseArea} />} />
      {rows.length === 0 ? (
        <EmptyState title={hasAny ? "No entries for this filter" : "Nothing logged yet."} />
      ) : (
        <>
          <LogTable rows={rows.slice(0, limit)} />
          {rows.length > limit && (
            <div>
              <Button variant="outline" onClick={() => setLimit(limit + PAGE_SIZE)}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
