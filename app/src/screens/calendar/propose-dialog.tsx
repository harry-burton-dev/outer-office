// Propose a new meeting: everything Outlook needs to create it. It shows on the
// Proposed layer and is not committed until an import finds it in Outlook.
// Recurring meetings are not proposed here yet.
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { commands, type NewMeeting } from "@/domain/commands";
import { addDays, dateIn, formatTime, instantIn } from "@/domain/dates";
import { NativeSelect } from "@/panels/task/native-select";
import { ErrorLine } from "@/screens/tasks/list-parts";
import { useRun } from "@/screens/tasks/use-run";
import type { Proposal } from "./calendar-data";

const SHOW_AS = [
  { value: "busy", label: "Busy" }, { value: "tentative", label: "Tentative" }, { value: "free", label: "Free" },
  { value: "oof", label: "Out of office" }, { value: "workingElsewhere", label: "Working elsewhere" },
];
const IMPORTANCE = [{ value: "normal", label: "Normal" }, { value: "high", label: "High" }, { value: "low", label: "Low" }];

export interface ProposeDialogProps {
  principal: string;
  timeZone: string;
  /** The day to start on, YYYY-MM-DD. */
  day: string;
  /** A proposal to change instead of a new one. */
  editing?: Proposal;
  onDone(): void;
}

function Row({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function ProposeDialog({ principal, timeZone, day, editing, onDone }: ProposeDialogProps) {
  const save = useRun(commands.proposalNew);
  const at = (iso: string | undefined, fallback: string) => (iso ? formatTime(iso, timeZone) : fallback);
  const [form, setForm] = useState(() => ({
    subject: editing?.subject ?? "",
    date: editing?.start ? dateIn(editing.start, timeZone) : day,
    from: at(editing?.start, "10:00"),
    to: at(editing?.end, "11:00"),
    allDay: editing?.allDay ?? false,
    location: editing?.location ?? "",
    online: editing?.online ?? false,
    requiredAttendees: editing?.requiredAttendees ?? "",
    optionalAttendees: editing?.optionalAttendees ?? "",
    categories: editing?.categories ?? "",
    showAs: editing?.showAs || "busy",
    importance: editing?.importance || "normal",
    private: editing?.sensitivity === "private",
    notes: editing?.notes ?? "",
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const start = form.allDay ? instantIn(form.date, "00:00", timeZone) : instantIn(form.date, form.from, timeZone);
    const end = form.allDay ? instantIn(addDays(form.date, 1), "00:00", timeZone) : instantIn(form.date, form.to, timeZone);
    const meeting: NewMeeting = {
      subject: form.subject, start, end, allDay: form.allDay, location: form.location, online: form.online,
      requiredAttendees: form.requiredAttendees, optionalAttendees: form.optionalAttendees, categories: form.categories,
      showAs: form.showAs as NewMeeting["showAs"], importance: form.importance as NewMeeting["importance"],
      sensitivity: form.private ? "private" : "normal", notes: form.notes,
    };
    if (save.run({ ...meeting, principal, id: editing?.id })) onDone();
  };

  return (
    <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{editing ? "Change the proposed meeting" : "Propose a meeting"}</DialogTitle>
          <DialogDescription>It shows on the Proposed layer until an import finds it in Outlook.</DialogDescription>
        </DialogHeader>
        <Row label="Subject" id="propose-subject">
          <Input id="propose-subject" value={form.subject} onChange={(e) => set("subject", e.target.value)} required />
        </Row>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1"><Row label="Day" id="propose-date"><Input id="propose-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} required /></Row></div>
          {!form.allDay && (
            <>
              <div className="w-28"><Row label="Starts" id="propose-from"><Input id="propose-from" type="time" value={form.from} onChange={(e) => set("from", e.target.value)} required /></Row></div>
              <div className="w-28"><Row label="Ends" id="propose-to"><Input id="propose-to" type="time" value={form.to} onChange={(e) => set("to", e.target.value)} required /></Row></div>
            </>
          )}
          <label className="flex h-8 items-center gap-2 text-sm"><Switch checked={form.allDay} onCheckedChange={(v) => set("allDay", v)} />All day</label>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1"><Row label="Location" id="propose-location"><Input id="propose-location" value={form.location} onChange={(e) => set("location", e.target.value)} /></Row></div>
          <label className="flex h-8 items-center gap-2 text-sm"><Switch checked={form.online} onCheckedChange={(v) => set("online", v)} />Teams meeting</label>
        </div>
        <Row label="Required attendees, one per line" id="propose-required">
          <Textarea id="propose-required" rows={2} value={form.requiredAttendees} onChange={(e) => set("requiredAttendees", e.target.value)} placeholder="Avery Stone <avery.stone@example.org>" />
        </Row>
        <Row label="Optional attendees, one per line" id="propose-optional">
          <Textarea id="propose-optional" rows={2} value={form.optionalAttendees} onChange={(e) => set("optionalAttendees", e.target.value)} />
        </Row>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Row label="Categories" id="propose-categories"><Input id="propose-categories" value={form.categories} onChange={(e) => set("categories", e.target.value)} placeholder="Board, External" /></Row>
          <Row label="Show as" id="propose-show-as"><NativeSelect id="propose-show-as" options={SHOW_AS} value={form.showAs} onChange={(e) => set("showAs", e.target.value)} /></Row>
          <Row label="Importance" id="propose-importance"><NativeSelect id="propose-importance" options={IMPORTANCE} value={form.importance} onChange={(e) => set("importance", e.target.value)} /></Row>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={form.private} onCheckedChange={(v) => set("private", v)} />Private</label>
        <Row label="Notes for the invite" id="propose-notes">
          <Textarea id="propose-notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Row>
        <ErrorLine error={save.error} />
        <DialogFooter>
          <Button type="submit">{editing ? "Save" : "Propose"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
