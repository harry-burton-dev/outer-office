// The clash wizard (OUT-85, v0.3 brief 8.2): a modal that steps through each
// unquiet clash in a range, offers the suggested fixes or a fix of your own,
// and lists the chosen fixes at the end. Nothing changes until Apply, which runs
// wizard.apply; Cancel, or closing it, changes nothing.
import { useMemo, useState } from "react";
import { useRecords } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/app/app-state";
import { useOffice } from "@/app/frame-data";
import { overlaysByEvent, type Clash } from "@/domain/clashes";
import { stillClashes, suggestedFixes, withFixes, wizardClashes, type Fix, type WizardWorld } from "@/domain/clash-wizard";
import { commands } from "@/domain/commands";
import { dateIn, formatDay, formatTime, instantIn } from "@/domain/dates";
import type { Event } from "@/domain/selectors";
import { ErrorLine } from "@/screens/tasks/list-parts";
import { useRun } from "@/screens/tasks/use-run";
import { DEFAULT_DAY_END, DEFAULT_DAY_START, titleOf } from "./calendar-data";
import { proposedRows } from "./move-dialog";

export interface ClashWizardProps {
  principal: string;
  /** The range it covers: clashes beginning in [from, to), ISO UTC instants. */
  from: string;
  to: string;
  /** A viewer's run (D15): Apply makes suggestions instead of changes. */
  suggest?: boolean;
  onDone(): void;
}

const SEVERITY: Record<Clash["severity"], string> = { hard: "Hard clash", soft: "Soft clash (tentative)", away: "Clash with a day away" };

/** One choice on a step: a suggested fix by its place in the list, or your own. */
type Choice = { kind: "suggested"; index: number } | { kind: "own-time"; event: string; date: string; time: string } | { kind: "own-note"; note: string };

function Engagement({ event, zone, priority }: { event: Event; zone: string; priority: number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm border p-3 text-sm" data-wizard-engagement="">
      <span className="truncate font-medium">{titleOf(event)}</span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {event.allDay ? `${formatDay(event.start ?? "", zone)}, all day` : `${formatDay(event.start ?? "", zone)}, ${formatTime(event.start ?? "", zone)} to ${formatTime(event.end ?? "", zone)}`}
      </span>
      {event.masked !== true && event.location && <span className="truncate text-xs text-muted-foreground">{event.location}</span>}
      {event.masked !== true && event.categories && <span className="truncate text-xs text-muted-foreground">{event.categories}</span>}
      {priority < 4 && <span className="text-xs text-muted-foreground">Priority p{priority}</span>}
    </div>
  );
}

export function ClashWizard({ principal, from, to, suggest = false, onDone }: ClashWizardProps) {
  const { now, timezone } = useApp();
  const office = useOffice();
  const events = useRecords("events");
  const overlays = useRecords("overlays");
  const proposals = useRecords("proposals");
  const apply = useRun(suggest ? commands.suggestionFromWizard : commands.wizardApply);
  const world = useMemo<WizardWorld>(() => {
    const live = events.filter((e) => !e._deleted);
    return { events: live, overlays: overlays.filter((o) => !o._deleted), proposed: proposedRows(proposals, live), zone: timezone, dayStart: office?.dayStart || DEFAULT_DAY_START, dayEnd: office?.dayEnd || DEFAULT_DAY_END, now };
  }, [events, overlays, proposals, timezone, office, now]);
  // The steps are fixed when the wizard opens.
  const [steps] = useState(() => wizardClashes(world, principal, from, to));
  const [at, setAt] = useState(0);
  const [choices, setChoices] = useState<Choice[]>([]);

  const byId = useMemo(() => new Map(world.events.map((e) => [e.id, e])), [world]);
  const title = (id: string) => (byId.get(id) ? titleOf(byId.get(id)!) : "The engagement");
  const priorityOf = (id: string) => overlaysByEvent(world.overlays).get(id)?.priority ?? 4;
  const when = (start: string) => `${formatDay(start, timezone)}, ${formatTime(start, timezone)}`;

  /** The fix a choice makes, read against the diary as the earlier fixes leave it. */
  const fixOf = (choice: Choice | undefined, suggestions: Fix[], clash: Clash): Fix => {
    if (!choice) return suggestions[0] ?? { kind: "leave" };
    if (choice.kind === "suggested") return suggestions[choice.index] ?? { kind: "leave" };
    if (choice.kind === "own-note") return choice.note.trim() ? { kind: "note", events: [clash.first, clash.second], note: choice.note.trim() } : { kind: "leave" };
    const event = byId.get(choice.event);
    if (!event?.start || !event.end || !choice.date || !choice.time) return { kind: "leave" };
    const start = instantIn(choice.date, choice.time, timezone);
    return { kind: "move", event: choice.event, start, end: new Date(Date.parse(start) + Date.parse(event.end) - Date.parse(event.start)).toISOString() };
  };

  // Each step reads the diary as the fixes chosen before it would leave it.
  const plan = (() => {
    const fixes: Fix[] = [];
    const shown: Array<{ settled: boolean; suggestions: Fix[] }> = [];
    for (const [i, clash] of steps.entries()) {
      const state = withFixes(world, fixes);
      const settled = !stillClashes(state, clash);
      const suggestions = settled ? [] : suggestedFixes(state, clash);
      shown.push({ settled, suggestions });
      fixes.push(settled ? { kind: "leave" } : fixOf(choices[i], suggestions, clash));
    }
    return { fixes, shown };
  })();

  const label = (fix: Fix): string => {
    switch (fix.kind) {
      case "move": return `Move ${title(fix.event)} to ${when(fix.start)}`;
      case "quiet": return `Set ${title(fix.event)} quiet`;
      case "link": return `Link ${title(fix.event)} under ${title(fix.parent)}`;
      case "note": return `Add a note to both: ${fix.note}`;
      case "leave": return "Leave it";
    }
  };

  const choose = (choice: Choice) => setChoices((current) => {
    const next = [...current];
    next[at] = choice;
    return next;
  });

  if (steps.length === 0) {
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>No clashes</DialogTitle>
          <DialogDescription>Nothing clashes in this range, apart from engagements set quiet.</DialogDescription>
        </DialogHeader>
        <DialogFooter><Button onClick={onDone}>Close</Button></DialogFooter>
      </DialogContent>
    );
  }

  const review = at >= steps.length;
  if (review) {
    const chosen = plan.fixes.filter((f) => f.kind !== "leave");
    return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{suggest ? "Suggest these fixes?" : "Apply these fixes?"}</DialogTitle>
          <DialogDescription>{suggest ? "Each fix becomes a suggestion an assistant can take or dismiss. Nothing else changes." : "Moves become proposals on the Proposed layer. Outlook doesn't change."}</DialogDescription>
        </DialogHeader>
        {chosen.length === 0 ? <p className="text-sm text-muted-foreground">Every clash is left as it is.</p> : (
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm" aria-label="Chosen fixes">
            {chosen.map((fix, i) => <li key={i}>{label(fix)}</li>)}
          </ol>
        )}
        <ErrorLine error={apply.error} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAt(steps.length - 1)}>Back</Button>
          <Button variant="outline" onClick={onDone}>Cancel</Button>
          <Button onClick={() => apply.run({ fixes: chosen }) && onDone()} disabled={chosen.length === 0}>{suggest ? "Suggest" : "Apply"}</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  const clash = steps[at]!;
  const { settled, suggestions } = plan.shown[at]!;
  const choice = choices[at] ?? { kind: "suggested", index: 0 };
  const first = byId.get(clash.first);
  const second = byId.get(clash.second);
  const movable = [clash.first, clash.second].filter((id) => byId.get(id)?.allDay !== true);
  const ownTime = choice.kind === "own-time" ? choice : { kind: "own-time" as const, event: movable[0] ?? clash.second, date: dateIn(clash.at, timezone), time: formatTime(clash.at, timezone) };
  const ownNote = choice.kind === "own-note" ? choice : { kind: "own-note" as const, note: "" };
  const radio = "size-4 accent-primary";

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{SEVERITY[clash.severity]}</DialogTitle>
        <DialogDescription>{`${at + 1} of ${steps.length}`}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2 sm:flex-row">
        {first && <Engagement event={first} zone={timezone} priority={priorityOf(first.id)} />}
        {second && <Engagement event={second} zone={timezone} priority={priorityOf(second.id)} />}
      </div>
      {settled ? (
        <p className="text-sm text-muted-foreground" data-settled="">An earlier fix already settles this clash.</p>
      ) : (
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 font-medium">Fix</legend>
          {suggestions.map((fix, index) => (
            <label key={index} className="flex items-center gap-2">
              <input type="radio" name="fix" className={radio} checked={choice.kind === "suggested" && choice.index === index} onChange={() => choose({ kind: "suggested", index })} />
              {label(fix)}
            </label>
          ))}
          {movable.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <input type="radio" name="fix" className={radio} checked={choice.kind === "own-time"} onChange={() => choose(ownTime)} />
                Move to a time you choose
              </label>
              {choice.kind === "own-time" && (
                <div className="flex flex-wrap items-end gap-2 pl-6">
                  {movable.length > 1 && (
                    <select aria-label="Which engagement" className="h-9 rounded-md border bg-background px-2" value={ownTime.event} onChange={(e) => choose({ ...ownTime, event: e.target.value })}>
                      {movable.map((id) => <option key={id} value={id}>{title(id)}</option>)}
                    </select>
                  )}
                  <div className="flex flex-col gap-1"><Label htmlFor="wizard-date">Day</Label><Input id="wizard-date" type="date" value={ownTime.date} onChange={(e) => choose({ ...ownTime, date: e.target.value })} /></div>
                  <div className="flex w-28 flex-col gap-1"><Label htmlFor="wizard-time">Starts</Label><Input id="wizard-time" type="time" value={ownTime.time} onChange={(e) => choose({ ...ownTime, time: e.target.value })} /></div>
                </div>
              )}
            </div>
          )}
          <label className="flex items-center gap-2">
            <input type="radio" name="fix" className={radio} checked={choice.kind === "own-note"} onChange={() => choose(ownNote)} />
            Add a note to both
          </label>
          {choice.kind === "own-note" && (
            <Textarea aria-label="Note" className="ml-6 w-auto" value={ownNote.note} onChange={(e) => choose({ kind: "own-note", note: e.target.value })} />
          )}
        </fieldset>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button variant="ghost" disabled={at === 0} onClick={() => setAt(at - 1)}>Back</Button>
        {!settled && <Button variant="ghost" onClick={() => { choose({ kind: "suggested", index: suggestions.length - 1 }); setAt(at + 1); }}>Skip</Button>}
        <Button onClick={() => setAt(at + 1)}>Next</Button>
      </DialogFooter>
    </DialogContent>
  );
}
