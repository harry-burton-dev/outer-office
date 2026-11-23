// Print: the chosen principal's diary as a day sheet, a briefing pack (the
// week, a day to a page) or a forward look (the next four weeks), with the
// office's cards, notes and follow-ups, printed (or saved as PDF) through the
// browser. Everything but the sheet is left off the page.
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { useRecord, useRecords } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/app/app-state";
import { usePeople } from "@/app/people";
import { PageHeader } from "@/app/ui";
import { addDays, weekdayOf } from "@/domain/dates";
import { sheetDays, type SheetDay } from "@/domain/sheets";
import { NativeSelect } from "@/panels/task/native-select";
import { openingDate } from "./calendar/calendar-data";
import { DaySheet } from "./print/day-sheet";
import { ForwardLook } from "./print/forward-look";

function useSheetDays(principalId: string, from: string, days: number) {
  const { timezone } = useApp();
  const { nameOf } = usePeople();
  const events = useRecords("events");
  const overlays = useRecords("overlays");
  const cards = useRecords("cards");
  const templates = useRecords("templates");
  const tasks = useRecords("tasks");
  const tags = useRecords("tags");
  return useMemo(
    () => sheetDays({ principal: principalId, from, days, zone: timezone, events, overlays, cards, templates, tasks, tags, nameOf }),
    [principalId, from, days, timezone, events, overlays, cards, templates, tasks, tags, nameOf],
  );
}

export type SheetKind = "day" | "week" | "forward";

const KINDS: readonly { value: SheetKind; label: string; date: string }[] = [
  { value: "day", label: "Day sheet", date: "Day" },
  { value: "week", label: "Briefing pack (week)", date: "Week of" },
  { value: "forward", label: "Forward look (4 weeks)", date: "From" },
];

const FORWARD_DAYS = 28;
const isKind = (value: string): value is SheetKind => KINDS.some((k) => k.value === value);

/** The days a sheet covers: the day; the week from its Monday; or four weeks from the day. */
export function rangeOf(kind: SheetKind, date: string): { from: string; days: number } {
  if (kind === "day") return { from: date, days: 1 };
  if (kind === "week") return { from: addDays(date, -((weekdayOf(date) + 6) % 7)), days: 7 };
  return { from: date, days: FORWARD_DAYS };
}

/** The week's weekdays, and Saturday or Sunday only when something is on. */
const weekDays = (days: readonly SheetDay[]): SheetDay[] => days.filter((d, i) => i < 5 || d.entries.length > 0);

export function PrintScreen({ principalId }: { principalId: string }) {
  const { today, timezone } = useApp();
  const principal = useRecord("principals", principalId);
  const [kind, setKind] = useState<SheetKind>("day");
  const [date, setDate] = useState(() => openingDate(today));
  const range = rangeOf(kind, date);
  const days = useSheetDays(principalId, range.from, range.days);
  const who = principal && !principal._deleted ? [principal.code, principal.title].filter(Boolean).join(" · ") : "";
  const dateLabel = KINDS.find((k) => k.value === kind)?.date ?? "Day";
  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <PageHeader
          title="Print"
          description="The diary with the office's cards, notes and follow-ups. Print it, or save it as a PDF from the print dialog."
          actions={<Button onClick={() => window.print()}><Printer aria-hidden />Print</Button>}
        />
        <div className="flex items-end gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="print-kind">Sheet</Label>
            <NativeSelect id="print-kind" className="w-56" options={KINDS} value={kind} onChange={(e) => isKind(e.target.value) && setKind(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="print-date">{dateLabel}</Label>
            <Input id="print-date" type="date" className="w-44" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
        </div>
      </div>
      <div data-print-sheet="" className="flex max-w-3xl flex-col gap-8 print:max-w-none">
        {kind === "forward" ? (
          <ForwardLook who={who} days={days} zone={timezone} />
        ) : (
          (kind === "week" ? weekDays(days) : days).map((day) => <DaySheet key={day.date} who={who} day={day} zone={timezone} />)
        )}
      </div>
    </div>
  );
}
