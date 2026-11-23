// The diary for the chosen principal: day and week, read-only. Clicking an
// event opens the engagement panel. The header names the principal and the
// latest import; with no events at all it points to the Import screen.
import { useMemo, useState } from "react";
import { useRecord, useRecords } from "@trellis/framework";
import { DiaryCalendar, type DiaryEvent, type DiaryView } from "@/calendar/diary-calendar";
import { Button } from "@/components/ui/button";
import { useApp } from "@/app/app-state";
import { useOffice } from "@/app/frame-data";
import { EmptyState, PageHeader } from "@/app/ui";
import { formatDay, formatTime } from "@/domain/dates";
import { DEFAULT_DAY_END, DEFAULT_DAY_START, diaryData, hasAnyEvent, latestImport } from "./calendar/calendar-data";
import { EventFaceView } from "./calendar/event-face";

const TITLE = "Calendar";

function useHeaderLine(principalId: string, timezone: string): string {
  const principal = useRecord("principals", principalId);
  const imports = useRecords("imports");
  const last = latestImport(imports, principalId);
  const who = principal && !principal._deleted ? [principal.code, principal.title].filter(Boolean) : [];
  const imported = last?.at ? [`Imported ${formatDay(last.at, timezone)} ${formatTime(last.at, timezone)} by ${last.by ?? "someone"}`] : [];
  return [...who, ...imported].join(" · ");
}

interface DiaryProps {
  principalId: string;
}

function Diary({ principalId }: DiaryProps) {
  const { timezone, today, openPanel } = useApp();
  const office = useOffice();
  const events = useRecords("events");
  const overlays = useRecords("overlays");
  const [view, setView] = useState<DiaryView>("week");
  const [date, setDate] = useState(today);
  const data = useMemo(() => diaryData(events, overlays, principalId), [events, overlays, principalId]);
  const renderEvent = (event: DiaryEvent) => {
    const face = data.faces.get(event.id);
    return face ? <EventFaceView face={face} /> : undefined;
  };
  return (
    <DiaryCalendar
      events={data.events}
      view={view}
      date={date}
      timeZone={timezone}
      dayStart={office?.dayStart || DEFAULT_DAY_START}
      dayEnd={office?.dayEnd || DEFAULT_DAY_END}
      onEventClick={(id) => openPanel({ kind: "engagement", id })}
      onNavigate={setDate}
      onViewChange={setView}
      renderEvent={renderEvent}
    />
  );
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
    <div className="flex flex-col">
      <PageHeader title={TITLE} description={line || undefined} />
      {hasAnyEvent(events, principalId) ? <Diary principalId={principalId} /> : <NoCalendar />}
    </div>
  );
}
