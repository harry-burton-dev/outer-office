// The forward look: the coming weeks at a glance, one line per engagement,
// with how far each card is filled in. Days with nothing on are left out.
import { formatTime } from "@/domain/dates";
import type { SheetDay, SheetEntry } from "@/domain/sheets";
import { longDate } from "./day-sheet";

const timeText = (entry: SheetEntry, zone: string): string => (entry.allDay ? "All day" : entry.start ? formatTime(entry.start, zone) : "");

function cardsText(entry: SheetEntry): string {
  return entry.cards.map((c) => (c.done === c.total ? `${c.name} done` : `${c.name} ${c.done} of ${c.total}`)).join(", ");
}

export interface ForwardLookProps {
  who: string;
  days: readonly SheetDay[];
  zone: string;
}

export function ForwardLook({ who, days, zone }: ForwardLookProps) {
  const busy = days.filter((d) => d.entries.length > 0);
  const first = days[0]?.date ?? "";
  const last = days[days.length - 1]?.date ?? "";
  return (
    <article className="flex flex-col gap-4" aria-label="Forward look">
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold">{`Forward look: ${longDate(first)} to ${longDate(last)}`}</h2>
        <p className="text-sm text-muted-foreground">{who}</p>
      </header>
      {busy.length === 0 && <p className="border-t py-3 text-sm text-muted-foreground">Nothing in the diary.</p>}
      {busy.map((day) => (
        <section key={day.date} className="flex flex-col break-inside-avoid" aria-label={longDate(day.date)} data-sheet-day={day.date}>
          <h3 className="pb-1 font-medium">{longDate(day.date)}</h3>
          <table className="w-full border-t text-sm">
            <tbody>
              {day.entries.map((entry) => (
                <tr key={entry.id} className="border-b align-top" data-sheet-entry="">
                  <td className="w-20 py-1 pr-3 font-mono tabular-nums">{timeText(entry, zone)}</td>
                  <td className={entry.masked ? "py-1 pr-3 text-muted-foreground" : "py-1 pr-3"}>{entry.flagged ? `${entry.title} (flagged)` : entry.title}</td>
                  <td className="py-1 pr-3 text-muted-foreground">{entry.location}</td>
                  <td className="py-1 text-right text-muted-foreground">{cardsText(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </article>
  );
}
