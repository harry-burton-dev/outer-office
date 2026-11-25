// Propose a move: pick a new day and start time, or one of the next free slots
// from Find a time; the length stays the same. The event stays where Outlook
// has it until the change is made there.
import { useState, type FormEvent } from "react";
import { useRecords } from "@trellis/framework";
import { useApp } from "@/app/app-state";
import { useOffice } from "@/app/frame-data";
import { findATime, type Slot } from "@/domain/find-a-time";
import type { Event } from "@/domain/selectors";
import { DEFAULT_DAY_END, DEFAULT_DAY_START, newId, type Proposal } from "./calendar-data";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { commands } from "@/domain/commands";
import { dateIn, formatDay, formatTime, instantIn } from "@/domain/dates";
import { ErrorLine } from "@/screens/tasks/list-parts";
import { useRun } from "@/screens/tasks/use-run";

export interface MoveTarget {
  id: string;
  title: string;
  /** ISO UTC instants: where it is now, or where it is already proposed to go. */
  start: string;
  end: string;
}

export interface MoveDialogProps {
  target: MoveTarget;
  timeZone: string;
  /** A viewer suggests the move (D15) instead of proposing it. */
  suggest?: boolean;
  onDone(): void;
}

/** The principal's proposals as rows at their proposed times, for Find a time: a move under its engagement's id, a new meeting under its diary id. */
export function proposedRows(proposals: readonly Proposal[], events: readonly Event[]): Event[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  return proposals.filter((p) => !p._deleted && p.start && p.end).flatMap((p): Event[] => {
    if (p.kind === "new") return [{ id: newId(p.id), _deleted: false, _conflicts: {}, principal: p.principal, start: p.start, end: p.end, allDay: p.allDay, showAs: p.showAs || "busy" } as Event];
    const event = byId.get(p.event ?? "");
    return event ? [{ ...event, start: p.start, end: p.end }] : [];
  });
}

export function MoveDialog({ target, timeZone, suggest = false, onDone }: MoveDialogProps) {
  const move = useRun(commands.proposalMove);
  const suggestion = useRun(commands.suggestionMake);
  const [date, setDate] = useState(() => dateIn(target.start, timeZone));
  const [time, setTime] = useState(() => formatTime(target.start, timeZone));
  const { now } = useApp();
  const office = useOffice();
  const events = useRecords("events");
  const overlays = useRecords("overlays");
  const proposals = useRecords("proposals");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const findTime = () => {
    const event = events.find((e) => e.id === target.id && !e._deleted);
    if (!event) return setSlots([]);
    setSlots(findATime({
      event: { ...event, start: target.start, end: target.end }, events, overlays, proposed: proposedRows(proposals, events), zone: timeZone,
      dayStart: office?.dayStart || DEFAULT_DAY_START, dayEnd: office?.dayEnd || DEFAULT_DAY_END, now,
    }));
  };
  const choose = (slot: Slot) => {
    setDate(dateIn(slot.start, timeZone));
    setTime(formatTime(slot.start, timeZone));
  };
  const length = Date.parse(target.end) - Date.parse(target.start);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!date || !time) return;
    const start = instantIn(date, time, timeZone);
    const end = new Date(Date.parse(start) + length).toISOString();
    if (suggest ? suggestion.run({ event: target.id, kind: "move", start, end }) : move.run({ event: target.id, start, end })) onDone();
  };
  return (
    <DialogContent>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{suggest ? "Suggest a move" : "Propose a move"}</DialogTitle>
          <DialogDescription>
            {suggest
              ? `An assistant sees your suggestion to move ${target.title} and can take it or dismiss it.`
              : `${target.title} goes to the Proposed layer at the new time. A ghost stays in the live diary until the change is made in Outlook.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="move-date">Day</Label>
            <Input id="move-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="flex w-32 flex-col gap-1.5">
            <Label htmlFor="move-time">Starts</Label>
            <Input id="move-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={findTime}>Find a time</Button>
          {slots !== null && (slots.length === 0 ? (
            <p className="text-xs text-muted-foreground">No free time of this length in the next 10 working days.</p>
          ) : (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Free times">
              {slots.map((slot) => {
                const label = `${formatDay(slot.start, timeZone)}, ${formatTime(slot.start, timeZone)} to ${formatTime(slot.end, timeZone)}`;
                const chosen = dateIn(slot.start, timeZone) === date && formatTime(slot.start, timeZone) === time;
                return <Button key={slot.start} type="button" size="sm" variant={chosen ? "default" : "secondary"} aria-pressed={chosen} onClick={() => choose(slot)}>{label}</Button>;
              })}
            </div>
          ))}
        </div>
        <ErrorLine error={suggest ? suggestion.error : move.error} />
        <DialogFooter>
          <Button type="submit">{suggest ? "Suggest" : "Propose"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
