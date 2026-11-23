// Propose a move: pick a new day and start time; the length stays the same.
// The event stays where Outlook has it until the change is made there.
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { commands } from "@/domain/commands";
import { dateIn, formatTime, instantIn } from "@/domain/dates";
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
  onDone(): void;
}

export function MoveDialog({ target, timeZone, onDone }: MoveDialogProps) {
  const move = useRun(commands.proposalMove);
  const [date, setDate] = useState(() => dateIn(target.start, timeZone));
  const [time, setTime] = useState(() => formatTime(target.start, timeZone));
  const length = Date.parse(target.end) - Date.parse(target.start);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!date || !time) return;
    const start = instantIn(date, time, timeZone);
    const end = new Date(Date.parse(start) + length).toISOString();
    if (move.run({ event: target.id, start, end })) onDone();
  };
  return (
    <DialogContent>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Propose a move</DialogTitle>
          <DialogDescription>
            {target.title} goes to the Proposed layer at the new time. A ghost stays in the live diary until the change is made in Outlook.
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
        <ErrorLine error={move.error} />
        <DialogFooter>
          <Button type="submit">Propose</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
