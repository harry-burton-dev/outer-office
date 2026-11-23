// The diary itself: the calendar with its lens, layers and right-click menu.
// Live is the diary as Outlook has it; up is Proposed (moves and new meetings
// not yet in Outlook), down is the graveyard (gone from Outlook, or archived).
import { useMemo, useState } from "react";
import { useRecords } from "@trellis/framework";
import { PlusIcon } from "lucide-react";
import { DiaryCalendar, type DiaryEvent, type DiaryView } from "@/calendar/diary-calendar";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog } from "@/components/ui/dialog";
import { useApp } from "@/app/app-state";
import { useOffice } from "@/app/frame-data";
import { commands } from "@/domain/commands";
import { lensById } from "@/domain/lenses";
import { TagMenu } from "@/tags/tag-menu";
import { useRun } from "../tasks/use-run";
import { DEFAULT_DAY_END, DEFAULT_DAY_START, diaryData, eventIdOf, openingDate, proposalIdOf, type EventFace, type Layer, type Proposal } from "./calendar-data";
import { EventFaceView } from "./event-face";
import { LayerSwitch } from "./layer-switch";
import { LensMenu } from "./lens-menu";
import { MoveDialog, type MoveTarget } from "./move-dialog";
import { ProposeDialog } from "./propose-dialog";

/** What fills a meeting: the right-click target over all of it, a lens's fill, a ghost's dashes or the slider's veil. */
function Entry({ face }: { face: EventFace }) {
  const cover = face.ghost
    ? { className: "absolute inset-0 rounded-[inherit] border border-dashed border-foreground/50 bg-background/75" }
    : face.veil
      ? { className: "absolute inset-0", style: { background: `color-mix(in srgb, var(--background) ${Math.round(face.veil * 100)}%, transparent)` } }
      : { className: "absolute inset-0", style: face.lensFill ? { background: face.lensFill } : undefined };
  return (
    <div className="min-w-0" data-ghost={face.ghost ? "" : undefined}>
      <span aria-hidden {...cover} />
      <div className={face.ghost ? "relative min-w-0 text-muted-foreground" : "relative min-w-0"} style={face.veil ? { opacity: 1 - face.veil * 0.8 } : undefined}>
        <EventFaceView face={face} />
      </div>
    </div>
  );
}

/** How strongly the live diary shows behind the proposals. */
function LiveAlpha({ value, onChange }: { value: number; onChange(value: number): void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Live
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} aria-label="How strongly the live diary shows" className="w-24 accent-primary" />
    </label>
  );
}

type Dialogs = { kind: "move"; target: MoveTarget } | { kind: "propose"; day: string; editing?: Proposal } | null;

export function Diary({ principalId }: { principalId: string }) {
  const { timezone, today, now, isViewer, openPanel } = useApp();
  const office = useOffice();
  const events = useRecords("events");
  const overlays = useRecords("overlays");
  const tags = useRecords("tags");
  const proposals = useRecords("proposals");
  const [view, setView] = useState<DiaryView>("week");
  const [date, setDate] = useState(() => openingDate(today));
  const [lensId, setLensId] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>("live");
  const [liveAlpha, setLiveAlpha] = useState(0.35);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const withdraw = useRun(commands.proposalWithdraw);
  const drop = useRun(commands.proposalDrop);
  const archive = useRun(commands.overlaySet);

  const data = useMemo(() => {
    const lens = lensById(lensId);
    return diaryData(events, overlays, principalId, tags, lens ? { lens, now: new Date(now) } : undefined, { layer, proposals, liveAlpha });
  }, [events, overlays, principalId, tags, lensId, now, layer, proposals, liveAlpha]);

  const proposalById = (id: string) => proposals.find((p) => p.id === id && !p._deleted);
  const editNew = (pid: string) => {
    const editing = proposalById(pid);
    if (editing) setDialog({ kind: "propose", day: date, editing });
  };

  const renderEvent = (event: DiaryEvent) => {
    const face = data.faces.get(event.id);
    if (!face) return undefined;
    const pid = proposalIdOf(event.id);
    if (pid !== undefined) {
      // A proposed new meeting: no tags or panel until it is in Outlook.
      return (
        <ContextMenu>
          <ContextMenuTrigger render={<div className="min-w-0"><Entry face={face} /></div>} />
          {!isViewer && (
            <ContextMenuContent>
              <ContextMenuItem onClick={() => editNew(pid)}>Change…</ContextMenuItem>
              <ContextMenuItem onClick={() => drop.run({ id: pid })}>Withdraw the proposal</ContextMenuItem>
            </ContextMenuContent>
          )}
        </ContextMenu>
      );
    }
    const id = eventIdOf(event.id);
    const open = () => openPanel({ kind: "engagement", id });
    // A ghost moves the real entry; on the live layer the real entry is the ghost, so it moves from the proposed time.
    const proposal = proposals.find((p) => !p._deleted && p.kind !== "new" && p.event === id);
    const from = proposal?.start && proposal.end ? { start: proposal.start, end: proposal.end } : { start: event.start, end: event.end };
    const actions = isViewer ? undefined : layer === "graveyard" ? (
      face.archived && <ContextMenuItem onClick={() => archive.run({ event: id, archived: false })}>Bring back from the archive</ContextMenuItem>
    ) : (
      <>
        <ContextMenuItem onClick={() => setDialog({ kind: "move", target: { id, title: face.title, ...from } })}>Move…</ContextMenuItem>
        {face.proposed && <ContextMenuItem onClick={() => withdraw.run({ event: id })}>Withdraw the proposal</ContextMenuItem>}
        <ContextMenuItem onClick={() => archive.run({ event: id, archived: true })}>Archive</ContextMenuItem>
      </>
    );
    return (
      <TagMenu target="event" id={id} own={face.ownTags} categories={face.categories} onOpen={open} actions={actions}>
        <div className="min-w-0"><Entry face={face} /></div>
      </TagMenu>
    );
  };

  const onEventClick = (entryId: string) => {
    const pid = proposalIdOf(entryId);
    if (pid !== undefined) return isViewer ? undefined : editNew(pid);
    openPanel({ kind: "engagement", id: eventIdOf(entryId) });
  };

  const propose = () => {
    setLayer("proposed");
    setDialog({ kind: "propose", day: date });
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
        onEventClick={onEventClick}
        onNavigate={setDate}
        onViewChange={setView}
        renderEvent={renderEvent}
        toolbarExtra={
          <>
            {!isViewer && <Button variant="outline" onClick={propose}><PlusIcon />Propose</Button>}
            {layer === "proposed" && <LiveAlpha value={liveAlpha} onChange={setLiveAlpha} />}
            <LensMenu value={lensId} onChange={setLensId} />
            <LayerSwitch value={layer} onChange={setLayer} />
          </>
        }
      />
      <Dialog open={dialog !== null} onOpenChange={(next) => !next && setDialog(null)}>
        {dialog?.kind === "move" && <MoveDialog target={dialog.target} timeZone={timezone} onDone={() => setDialog(null)} />}
        {dialog?.kind === "propose" && (
          <ProposeDialog principal={principalId} timeZone={timezone} day={dialog.day} editing={dialog.editing} onDone={() => setDialog(null)} />
        )}
      </Dialog>
      {[withdraw.error, drop.error, archive.error].filter(Boolean).map((e) => <p key={e} role="alert" className="text-xs text-destructive">{e}</p>)}
    </>
  );
}
