// The diary for the chosen principal: day and week, read-only. Clicking an
// event opens the engagement panel. The header names the principal and the
// latest import; with no events at all it points to the Import screen.
import { useMemo, useState } from "react";
import { useRecord, useRecords } from "@trellis/framework";
import { DiaryCalendar, type DiaryEvent, type DiaryView } from "@/calendar/diary-calendar";
import { Button } from "@/components/ui/button";
import { useApp } from "@/app/app-state";
import { useOffice } from "@/app/frame-data";
import { usePeople } from "@/app/people";
import { EmptyState, PageHeader } from "@/app/ui";
import { formatDay, formatTime } from "@/domain/dates";
import { DEFAULT_DAY_END, DEFAULT_DAY_START, diaryData, eventIdOf, hasAnyEvent, latestImport, openingDate, type Layer } from "./calendar/calendar-data";
import { LayerSwitch } from "./calendar/layer-switch";
import { MoveDialog, type MoveTarget } from "./calendar/move-dialog";
import { Dialog } from "@/components/ui/dialog";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { commands } from "@/domain/commands";
import { useRun } from "./tasks/use-run";
import { EventFaceView } from "./calendar/event-face";
import { TagMenu } from "@/tags/tag-menu";
import { LensMenu } from "./calendar/lens-menu";
import { lensById } from "@/domain/lenses";

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

interface DiaryProps {
  principalId: string;
}

function Diary({ principalId }: DiaryProps) {
  const { timezone, today, now, isViewer, openPanel } = useApp();
  const office = useOffice();
  const events = useRecords("events");
  const overlays = useRecords("overlays");
  const tags = useRecords("tags");
  const proposals = useRecords("proposals");
  const [layer, setLayer] = useState<Layer>("live");
  const [moving, setMoving] = useState<MoveTarget | null>(null);
  const withdraw = useRun(commands.proposalWithdraw);
  const [view, setView] = useState<DiaryView>("week");
  const [date, setDate] = useState(() => openingDate(today));
  const [lensId, setLensId] = useState<string | null>(null);
  const data = useMemo(() => {
    const lens = lensById(lensId);
    return diaryData(events, overlays, principalId, tags, lens ? { lens, now: new Date(now) } : undefined, { layer, proposals });
  }, [events, overlays, principalId, tags, lensId, now, layer, proposals]);
  const renderEvent = (event: DiaryEvent) => {
    const face = data.faces.get(event.id);
    if (!face) return undefined;
    const id = eventIdOf(event.id);
    const open = () => openPanel({ kind: "engagement", id });
    // A ghost moves the real entry; on the live layer the real entry is the ghost, so it moves from the proposed time.
    const proposal = proposals.find((p) => !p._deleted && p.event === id);
    const from = proposal?.start && proposal.end ? { start: proposal.start, end: proposal.end } : { start: event.start, end: event.end };
    const actions = isViewer || layer === "graveyard" ? undefined : (
      <>
        <ContextMenuItem onClick={() => setMoving({ id, title: face.title, ...from })}>Move…</ContextMenuItem>
        {face.proposed && <ContextMenuItem onClick={() => withdraw.run({ event: id })}>Withdraw the proposal</ContextMenuItem>}
      </>
    );
    return (
      <TagMenu target="event" id={id} own={face.ownTags} categories={face.categories} onOpen={open} actions={actions}>
        <div className="min-w-0" data-ghost={face.ghost ? "" : undefined}>
          {/* Spreads the right-click target over the whole meeting, not just its text, and carries a lens's fill or a ghost's veil. */}
          <span
            aria-hidden
            className={face.ghost ? "absolute inset-0 rounded-[inherit] border border-dashed border-foreground/50 bg-background/75" : "absolute inset-0"}
            style={face.lensFill && !face.ghost ? { background: face.lensFill } : undefined}
          />
          <div className={face.ghost ? "relative min-w-0 text-muted-foreground" : "relative min-w-0"}>
            <EventFaceView face={face} />
          </div>
        </div>
      </TagMenu>
    );
  };
  return (
    <>
    <DiaryCalendar
      events={data.events}
      view={view}
      date={date}
      timeZone={timezone}
      dayStart={office?.dayStart || DEFAULT_DAY_START}
      dayEnd={office?.dayEnd || DEFAULT_DAY_END}
      onEventClick={(id) => openPanel({ kind: "engagement", id: eventIdOf(id) })}
      onNavigate={setDate}
      onViewChange={setView}
      renderEvent={renderEvent}
      toolbarExtra={
        <>
          <LensMenu value={lensId} onChange={setLensId} />
          <LayerSwitch value={layer} onChange={setLayer} />
        </>
      }
    />
    <Dialog open={moving !== null} onOpenChange={(next) => !next && setMoving(null)}>
      {moving && <MoveDialog target={moving} timeZone={timezone} onDone={() => setMoving(null)} />}
    </Dialog>
    </>
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
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={TITLE} description={line || undefined} />
      {hasAnyEvent(events, principalId) ? <Diary principalId={principalId} /> : <NoCalendar />}
    </div>
  );
}
