// The diary itself: the calendar with its lens, layers and right-click menu.
// Live is the diary as Outlook has it; up is Proposed (moves and new meetings
// not yet in Outlook), down is the graveyard (gone from Outlook, or archived).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecords } from "@trellis/framework";
import { PlusIcon } from "lucide-react";
import { DiaryCalendar, viewRange, type DiaryEvent, type DiaryView } from "@/calendar/diary-calendar";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog } from "@/components/ui/dialog";
import { useApp } from "@/app/app-state";
import { useOffice } from "@/app/frame-data";
import { addDays, formatDay, formatTime, instantIn } from "@/domain/dates";
import { wizardClashes } from "@/domain/clash-wizard";
import { commands } from "@/domain/commands";
import { ARCHIVE_REASONS } from "@/domain/commands/overlay";
import type { NewMeeting } from "@/domain/commands/proposals";
import { lensById } from "@/domain/lenses";
import { TagMenu } from "@/tags/tag-menu";
import { useRun } from "../tasks/use-run";
import { DEFAULT_DAY_END, DEFAULT_DAY_START, diaryData, eventIdOf, proposalIdOf, type EventFace, type Layer, type Proposal } from "./calendar-data";
import { CLASH_EDGE, CLASH_LABELS, EventFaceView, type CardShape } from "./event-face";
import { cardsOn, fieldsOf, isComplete, progressOf, valuesOf } from "@/domain/cards";
import { LayerSwitch } from "./layer-switch";
import { LensMenu } from "./lens-menu";
import { MoveDialog, type MoveTarget } from "./move-dialog";
import { ProposeDialog } from "./propose-dialog";
import { ClashWizard } from "./clash-wizard";
import { DaySummaryView } from "./day-summary-view";
import { clashes } from "@/domain/clashes";
import { daySummary } from "@/domain/day-summary";

/** What fills a meeting: the right-click target over all of it, a lens's fill, a ghost's dashes or the slider's veil. */
function Entry({ face, shapes, time, timeZone }: { face: EventFace; shapes?: readonly CardShape[]; time?: string; timeZone?: string }) {
  const cover = face.ghost
    ? { className: "absolute inset-0 rounded-[inherit] border border-dashed border-foreground/40 bg-background/80 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,var(--foreground)_5%,transparent)_6px_7px)]" }
    : face.veil
      ? { className: "absolute inset-0", style: { background: `color-mix(in srgb, var(--background) ${Math.round(face.veil * 100)}%, transparent)` } }
      : { className: "absolute inset-0", style: face.lensFill ? { background: face.lensFill } : undefined };
  return (
    <div className="min-w-0 pl-2" data-ghost={face.ghost ? "" : undefined}>
      <span aria-hidden {...cover} />
      <span aria-hidden className="absolute inset-y-1 left-1 w-[3px] rounded-full bg-(--fc-event-color)" />
      {face.clash && (
        <span aria-hidden data-clash={face.clash.severity} title={`${CLASH_LABELS[face.clash.severity]} with ${face.clash.with.join(", ")}`} className={`absolute inset-y-0 right-0 w-1 rounded-r-[inherit] ${CLASH_EDGE[face.clash.severity]}`} />
      )}
      <div className={face.ghost ? "relative min-w-0 text-muted-foreground" : "relative min-w-0"} style={face.veil ? { opacity: 1 - face.veil * 0.8 } : undefined}>
        <EventFaceView face={face} shapes={shapes} time={time} timeZone={timeZone} />
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

type Dialogs = { kind: "move"; target: MoveTarget; suggest?: boolean } | { kind: "propose"; day: string; editing?: Proposal } | { kind: "wizard"; from: string; to: string } | null;

/** The last drag or keyboard move, so Ctrl+Z can take it back: the entry, what it was called, where it went, and the proposal it replaced. */
interface LastMove {
  entry: string;
  title: string;
  start: string;
  before?: { start: string; end: string };
  /** A group move's linked engagements, each with the proposal it replaced. */
  children?: ReadonlyArray<{ event: string; before?: { start: string; end: string } }>;
}

const sameInstant = (a: string | undefined, b: string): boolean => a !== undefined && Date.parse(a) === Date.parse(b);

/** True when the keyboard is in a text field, where Ctrl+Z undoes typing. */
const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function Diary({ principalId }: { principalId: string }) {
  const { timezone, today, now, isViewer, openPanel } = useApp();
  const office = useOffice();
  const events = useRecords("events");
  const overlays = useRecords("overlays");
  const tags = useRecords("tags");
  const proposals = useRecords("proposals");
  const cards = useRecords("cards");
  const templates = useRecords("templates");
  const shapesOf = useMemo(() => {
    const byId = new Map(templates.filter((t) => !t._deleted).map((t) => [t.id, t]));
    return (eventId: string): CardShape[] => cardsOn(cards, eventId).map((c) => {
      const t = byId.get(c.template ?? "");
      return { id: c.id, shape: t?.shape, complete: isComplete(progressOf(fieldsOf(t?.fields), valuesOf(c.values))) };
    });
  }, [cards, templates]);
  const [view, setView] = useState<DiaryView>("week");
  const [date, setDate] = useState(today);
  const [lensId, setLensId] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>("live");
  const [liveAlpha, setLiveAlpha] = useState(0.35);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const withdraw = useRun(commands.proposalWithdraw);
  const drop = useRun(commands.proposalDrop);
  const archive = useRun(commands.overlaySet);
  const move = useRun(commands.proposalMove);
  const moveGroup = useRun(commands.proposalMoveGroup);
  const renew = useRun(commands.proposalNew);
  const suggest = useRun(commands.suggestionMake);
  const take = useRun(commands.suggestionTake);
  const dismiss = useRun(commands.suggestionDismiss);
  const suggestions = useRecords("suggestions");
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  const [lastSuggestion, setLastSuggestion] = useState<{ title: string; start: string } | null>(null);

  const data = useMemo(() => {
    const lens = lensById(lensId);
    return diaryData(events, overlays, principalId, tags, lens ? { lens, now: new Date(now) } : undefined, { layer, proposals, liveAlpha }, timezone);
  }, [events, overlays, principalId, tags, lensId, now, layer, proposals, liveAlpha, timezone]);

  // The day summary reads the live diary, whichever layer is shown (5.4).
  const liveClashes = useMemo(() => clashes(events.filter((e) => e.principal === principalId), overlays, timezone), [events, overlays, principalId, timezone]);
  const renderDayHeader = (day: string) => (
    <DaySummaryView summary={daySummary({
      date: day, zone: timezone, principal: principalId, events, overlays, clashes: liveClashes,
      dayStart: office?.dayStart || DEFAULT_DAY_START, dayEnd: office?.dayEnd || DEFAULT_DAY_END,
      longRunHours: office?.longRunHours, placeChangeMinutes: office?.placeChangeMinutes,
    })} onClashes={() => setDialog({ kind: "wizard", from: instantIn(day, "00:00", timezone), to: instantIn(addDays(day, 1), "00:00", timezone) })} />
  );

  const overlayOf = (id: string) => overlays.find((o) => !o._deleted && o.event === id);
  const quietOf = (id: string) => overlayOf(id)?.quiet === true;
  const priorityOf = (id: string) => overlayOf(id)?.priority ?? 4;

  const proposalById = (id: string) => proposals.find((p) => p.id === id && !p._deleted);
  const editNew = (pid: string) => {
    const editing = proposalById(pid);
    if (editing) setDialog({ kind: "propose", day: date, editing });
  };

  const renderEvent = (event: DiaryEvent, timeText: string) => {
    const face = data.faces.get(event.id);
    if (!face) return undefined;
    // Only a meeting tall enough for a second line shows its times.
    const time = !event.allDay && Date.parse(event.end) - Date.parse(event.start) >= 60 * 60_000 ? timeText : undefined;
    const pid = proposalIdOf(event.id);
    if (pid !== undefined) {
      // A proposed new meeting: no tags or panel until it is in Outlook.
      return (
        <ContextMenu>
          <ContextMenuTrigger render={<div className="min-w-0"><Entry face={face} time={time} /></div>} />
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
    const openSuggestions = suggestions.filter((s) => !s._deleted && s.state === "open" && s.event === id);
    const actions = isViewer ? (
      layer !== "graveyard" && canMove(event.id) && <ContextMenuItem onClick={() => setDialog({ kind: "move", target: { id, title: face.title, ...from }, suggest: true })}>Suggest a move…</ContextMenuItem>
    ) : layer === "graveyard" ? (
      face.archived && <ContextMenuItem onClick={() => archive.run({ event: id, archived: false })}>Bring back from the archive</ContextMenuItem>
    ) : (
      <>
        <ContextMenuItem onClick={() => setDialog({ kind: "move", target: { id, title: face.title, ...from } })}>Move…</ContextMenuItem>
        {face.proposed && <ContextMenuItem onClick={() => withdraw.run({ event: id })}>Withdraw the proposal</ContextMenuItem>}
        {openSuggestions.length > 0 && <ContextMenuSeparator />}
        {openSuggestions.map((s) => (
          <div key={s.id} data-suggestion={s.id}>
            <ContextMenuLabel>Suggested: {suggestionLabel(s)}</ContextMenuLabel>
            <ContextMenuItem onClick={() => take.run({ id: s.id })}>Take the suggestion</ContextMenuItem>
            <ContextMenuItem onClick={() => dismiss.run({ id: s.id })}>Dismiss it</ContextMenuItem>
          </div>
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => archive.run({ event: id, quiet: !quietOf(id) })}>{quietOf(id) ? "Not quiet" : "Quiet: never clashes"}</ContextMenuItem>
        <ContextMenuLabel>Priority</ContextMenuLabel>
        {[1, 2, 3, 4].map((p) => (
          <ContextMenuItem key={p} onClick={() => archive.run({ event: id, priority: p })}>{`P${p}${p === 4 ? " (none)" : ""}${priorityOf(id) === p ? " ✓" : ""}`}</ContextMenuItem>
        ))}
        <ContextMenuSeparator />
        <ContextMenuLabel>Archive as</ContextMenuLabel>
        {ARCHIVE_REASONS.map((r) => (
          <ContextMenuItem key={r.value} onClick={() => archive.run({ event: id, archived: true, archiveReason: r.value })}>{r.label}</ContextMenuItem>
        ))}
      </>
    );
    return (
      <TagMenu target="event" id={id} own={face.ownTags} onOpen={open} actions={actions}>
        <div className="min-w-0"><Entry face={face} shapes={shapesOf(id)} time={time} timeZone={timezone} /></div>
      </TagMenu>
    );
  };

  const onEventClick = (entryId: string) => {
    const pid = proposalIdOf(entryId);
    if (pid !== undefined) return isViewer ? undefined : editNew(pid);
    openPanel({ kind: "engagement", id: eventIdOf(entryId) });
  };

  const eventById = useMemo(() => new Map(events.filter((e) => !e._deleted).map((e) => [e.id, e])), [events]);

  /** What a suggestion would do, in words. */
  const suggestionLabel = (s: (typeof suggestions)[number]): string => {
    if (s.kind === "move") return `move to ${formatDay(s.start ?? "", timezone)}, ${formatTime(s.start ?? "", timezone)}`;
    if (s.kind === "quiet") return "set it quiet";
    if (s.kind === "link") return `link it under ${eventById.get(s.parent ?? "")?.subject || "another engagement"}`;
    return `add the note "${s.note ?? ""}"`;
  };

  /** An engagement that isn't masked, gone, archived or all-day can be moved, and so can a proposal (not by a viewer); a ghost can't. */
  const canMove = useCallback((entryId: string): boolean => {
    if (layer === "graveyard") return false;
    const face = data.faces.get(entryId);
    if (!face || face.archived) return false;
    const pid = proposalIdOf(entryId);
    if (pid !== undefined) return !isViewer && proposals.some((p) => p.id === pid && !p._deleted && !p.allDay);
    if (layer === "proposed" && face.ghost) return false;
    const event = eventById.get(eventIdOf(entryId));
    return event !== undefined && event.masked !== true && event.gone !== true && event.allDay !== true;
  }, [layer, data, proposals, eventById, isViewer]);

  /** Moves a proposed new meeting, or proposes (or re-proposes) a move; back to where Outlook has it withdraws the proposal. */
  const moveTo = (entryId: string, start: string, end: string): boolean => {
    const pid = proposalIdOf(entryId);
    if (pid !== undefined) {
      const p = proposalById(pid);
      if (!p) return false;
      return renew.run({
        id: pid, principal: p.principal ?? "", subject: p.subject ?? "", start, end, allDay: p.allDay, location: p.location, online: p.online,
        requiredAttendees: p.requiredAttendees, optionalAttendees: p.optionalAttendees, categories: p.categories,
        showAs: (p.showAs || undefined) as NewMeeting["showAs"], importance: (p.importance || undefined) as NewMeeting["importance"],
        sensitivity: (p.sensitivity || undefined) as NewMeeting["sensitivity"], notes: p.notes,
      });
    }
    const id = eventIdOf(entryId);
    const event = eventById.get(id);
    const proposed = proposals.some((p) => !p._deleted && p.kind !== "new" && p.event === id);
    const children = childrenOf(id);
    if (event && sameInstant(event.start, start) && sameInstant(event.end, end)) {
      // Back where Outlook has it: the proposal goes, and so do those its group move made.
      for (const p of proposals) if (!p._deleted && p.group === id && p.event !== id) withdraw.run({ event: p.event ?? "" });
      return proposed ? withdraw.run({ event: id }) : true;
    }
    // A parent moves with the engagements linked under it (5.2, B18).
    return children.length > 0 ? moveGroup.run({ event: id, start, end }) : move.run({ event: id, start, end });
  };

  /** The live engagements linked under an engagement. */
  const childrenOf = (id: string): string[] =>
    overlays.filter((o) => !o._deleted && o.parent === id && eventById.get(o.event ?? "")?.gone !== true && eventById.has(o.event ?? "")).map((o) => o.event ?? "");
  const proposedAt = (event: string) => {
    const p = proposals.find((q) => !q._deleted && q.kind !== "new" && q.event === event);
    return p?.start && p.end ? { start: p.start, end: p.end } : undefined;
  };

  const onMove = (entryId: string, start: string, end: string) => {
    const pid = proposalIdOf(entryId);
    const earlier = pid !== undefined ? proposalById(pid) : proposals.find((p) => !p._deleted && p.kind !== "new" && p.event === eventIdOf(entryId));
    const before = earlier?.start && earlier.end ? { start: earlier.start, end: earlier.end } : undefined;
    const title = data.faces.get(entryId)?.title ?? "The meeting";
    const children = pid === undefined ? childrenOf(eventIdOf(entryId)).map((event) => ({ event, before: proposedAt(event) })) : [];
    if (moveTo(entryId, start, end)) setLastMove({ entry: pid !== undefined ? entryId : eventIdOf(entryId), title, start, before, children });
  };

  /** A viewer's drag suggests the move (D15); nothing else changes. */
  const onSuggestMove = (entryId: string, start: string, end: string) => {
    const title = data.faces.get(entryId)?.title ?? "The meeting";
    if (suggest.run({ event: eventIdOf(entryId), kind: "move", start, end })) setLastSuggestion({ title, start });
  };

  /** Ctrl+Z straight after a move: back to the proposal it replaced, or no proposal at all. */
  const undo = () => {
    if (!lastMove) return;
    setLastMove(null);
    const pid = proposalIdOf(lastMove.entry);
    if (lastMove.before) {
      if (pid !== undefined) moveTo(lastMove.entry, lastMove.before.start, lastMove.before.end);
      else move.run({ event: lastMove.entry, ...lastMove.before });
    } else if (pid === undefined) withdraw.run({ event: lastMove.entry });
    for (const child of lastMove.children ?? []) {
      if (child.before) move.run({ event: child.event, ...child.before });
      else if (proposedAt(child.event)) withdraw.run({ event: child.event });
    }
  };

  useEffect(() => {
    if (!lastMove) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !typing(e.target)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The unquiet clashes in the range shown, for the toolbar's count and the wizard.
  const shownRange = useMemo(() => {
    const { first, end } = viewRange(view, date);
    return { from: instantIn(first, "00:00", timezone), to: instantIn(end, "00:00", timezone) };
  }, [view, date, timezone]);
  const clashCount = useMemo(
    () => wizardClashes({ events: events.filter((e) => !e._deleted), overlays: overlays.filter((o) => !o._deleted), zone: timezone }, principalId, shownRange.from, shownRange.to).length,
    [events, overlays, timezone, principalId, shownRange],
  );

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
        onMove={isViewer ? onSuggestMove : onMove}
        canMove={canMove}
        renderDayHeader={layer === "graveyard" ? undefined : renderDayHeader}
        toolbarExtra={
          <>
            {!isViewer && <Button variant="outline" onClick={propose}><PlusIcon />Propose</Button>}
            {clashCount > 0 && (
              <Button variant="outline" onClick={() => setDialog({ kind: "wizard", ...shownRange })} data-clash-count="">Clashes ({clashCount})</Button>
            )}
            {layer === "proposed" && <LiveAlpha value={liveAlpha} onChange={setLiveAlpha} />}
            <LensMenu value={lensId} onChange={setLensId} />
            <LayerSwitch value={layer} onChange={setLayer} />
          </>
        }
      />
      <Dialog open={dialog !== null} onOpenChange={(next) => !next && setDialog(null)}>
        {dialog?.kind === "move" && <MoveDialog target={dialog.target} timeZone={timezone} suggest={dialog.suggest} onDone={() => setDialog(null)} />}
        {dialog?.kind === "wizard" && <ClashWizard principal={principalId} from={dialog.from} to={dialog.to} suggest={isViewer} onDone={() => setDialog(null)} />}
        {dialog?.kind === "propose" && (
          <ProposeDialog principal={principalId} timeZone={timezone} day={dialog.day} editing={dialog.editing} onDone={() => setDialog(null)} />
        )}
      </Dialog>
      {lastMove && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground" data-last-move="">
          {lastMove.title} proposed for {formatDay(lastMove.start, timezone)}, {formatTime(lastMove.start, timezone)}. Outlook is unchanged.
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={undo}>Undo (Ctrl+Z)</Button>
        </p>
      )}
      {lastSuggestion && (
        <p role="status" className="text-xs text-muted-foreground" data-last-suggestion="">
          You suggested moving {lastSuggestion.title} to {formatDay(lastSuggestion.start, timezone)}, {formatTime(lastSuggestion.start, timezone)}. An assistant can take it or dismiss it.
        </p>
      )}
      {[withdraw.error, drop.error, archive.error, move.error, moveGroup.error, renew.error, suggest.error, take.error, dismiss.error].filter(Boolean).map((e) => <p key={e} role="alert" className="text-xs text-destructive">{e}</p>)}
    </>
  );
}
