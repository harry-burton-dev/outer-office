// Print: the chosen principal's day as a sheet, with the office's cards, notes
// and follow-ups, printed (or saved as PDF) through the browser. Everything
// but the sheet is left off the page.
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { useRecord, useRecords } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/app/app-state";
import { usePeople } from "@/app/people";
import { PageHeader } from "@/app/ui";
import { sheetDays } from "@/domain/sheets";
import { openingDate } from "./calendar/calendar-data";
import { DaySheet } from "./print/day-sheet";

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

export function PrintScreen({ principalId }: { principalId: string }) {
  const { today, timezone } = useApp();
  const principal = useRecord("principals", principalId);
  const [date, setDate] = useState(() => openingDate(today));
  const days = useSheetDays(principalId, date, 1);
  const who = principal && !principal._deleted ? [principal.code, principal.title].filter(Boolean).join(" · ") : "";
  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <PageHeader
          title="Print"
          description="A day sheet of the diary with the office's cards, notes and follow-ups. Print it, or save it as a PDF from the print dialog."
          actions={<Button onClick={() => window.print()}><Printer aria-hidden />Print</Button>}
        />
        <div className="flex items-end gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="print-date">Day</Label>
            <Input id="print-date" type="date" className="w-44" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
        </div>
      </div>
      <div data-print-sheet="" className="flex max-w-3xl flex-col gap-8 print:max-w-none">
        {days.map((day) => <DaySheet key={day.date} who={who} day={day} zone={timezone} />)}
      </div>
    </div>
  );
}
