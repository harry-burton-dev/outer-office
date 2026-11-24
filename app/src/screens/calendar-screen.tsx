// The diary for the chosen principal: day and week, read-only. Clicking an
// event opens the engagement panel. The header names the principal and the
// latest import; with no events at all it points to the Import screen.
import { useRecord, useRecords } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { useApp } from "@/app/app-state";
import { usePeople } from "@/app/people";
import { EmptyState, PageHeader } from "@/app/ui";
import { formatDay, formatTime } from "@/domain/dates";
import { hasAnyEvent, latestImport } from "./calendar/calendar-data";
import { Diary } from "./calendar/diary";

const TITLE = "Calendar";

function useHeaderLine(principalId: string, timezone: string): string {
  const principal = useRecord("principals", principalId);
  const imports = useRecords("imports");
  const last = latestImport(imports, principalId);
  const { nameOf } = usePeople();
  const who = principal && !principal._deleted ? [principal.code, principal.title].filter(Boolean) : [];
  const imported = last?.at ? [`Imported ${formatDay(last.at, timezone)} ${formatTime(last.at, timezone)} by ${last.by ? nameOf(last.by) : "someone"}`] : [];
  return [...who, ...imported].join(" · ");
}

function NoCalendar() {
  const { isViewer, go } = useApp();
  const action = isViewer ? undefined : <Button onClick={() => go("import")}>Import a calendar</Button>;
  return <EmptyState title="No calendar imported yet" action={action} />;
}

export function CalendarScreen() {
  const { principalId, timezone } = useApp();
  const events = useRecords("events");
  const line = useHeaderLine(principalId ?? "", timezone);
  if (principalId === null) return <PageHeader title={TITLE} />;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={TITLE} description={line || undefined} />
      {hasAnyEvent(events, principalId) ? <Diary principalId={principalId} /> : <NoCalendar />}
    </div>
  );
}
