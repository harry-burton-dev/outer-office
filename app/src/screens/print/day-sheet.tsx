// One day of a principal's diary as a printed sheet: each engagement with the
// office's layer on it. Black on white in print, whatever the theme.
import { formatTime } from "@/domain/dates";
import type { SheetDay, SheetEntry } from "@/domain/sheets";

/** "Tuesday 24 November 2026" */
export function longDate(date: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).formatToParts(new Date(`${date}T12:00:00Z`));
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}

/** "24 Nov" */
const shortDate = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00Z`));

function timeText(entry: SheetEntry, zone: string): string {
  if (entry.allDay) return "All day";
  if (!entry.start) return "";
  return entry.end ? `${formatTime(entry.start, zone)}–${formatTime(entry.end, zone)}` : formatTime(entry.start, zone);
}

function Entry({ entry, zone }: { entry: SheetEntry; zone: string }) {
  const meta = [entry.location, entry.tags.join(", "), entry.flagged ? "Flagged" : ""].filter(Boolean).join(" · ");
  return (
    <li className="grid grid-cols-[7rem_1fr] gap-x-4 border-t py-3 break-inside-avoid" data-sheet-entry="">
      <p className="font-mono text-sm tabular-nums">{timeText(entry, zone)}</p>
      <div className="flex min-w-0 flex-col gap-2">
        <div>
          <h3 className={entry.masked ? "text-muted-foreground" : "font-medium"}>{entry.title}</h3>
          {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
        </div>
        {entry.attendees.length > 0 && <p className="text-sm"><span className="text-muted-foreground">With </span>{entry.attendees.join(", ")}</p>}
        {entry.cards.map((card, i) => (
          <section key={i} className="flex flex-col gap-1" aria-label={card.name}>
            <h4 className="text-sm font-medium">{card.name} <span className="font-normal text-muted-foreground">{`${card.done} of ${card.total} done`}</span></h4>
            {card.fields.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                {card.fields.map((f) => (
                  <div key={f.label} className="contents">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="whitespace-pre-wrap">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}
        {entry.notes && (
          <section aria-label="Notes" className="flex flex-col gap-1">
            <h4 className="text-sm font-medium">Notes</h4>
            <p className="text-sm whitespace-pre-wrap">{entry.notes}</p>
          </section>
        )}
        {entry.children.length > 0 && (
          <section aria-label="Run of show" className="flex flex-col gap-1">
            <h4 className="text-sm font-medium">Run of show</h4>
            <ol className="text-sm" data-run-of-show="">
              {entry.children.map((child) => (
                <li key={child.id} className="grid grid-cols-[7rem_1fr] gap-x-2">
                  <span className="font-mono tabular-nums">{timeText(child, zone)}</span>
                  <span className={child.masked ? "text-muted-foreground" : undefined}>{[child.title, child.location !== entry.location ? child.location : ""].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        {entry.tasks.length > 0 && (
          <section aria-label="Follow-ups" className="flex flex-col gap-1">
            <h4 className="text-sm font-medium">Follow-ups</h4>
            <ul className="text-sm">
              {entry.tasks.map((t, i) => (
                <li key={i} className={t.done ? "text-muted-foreground line-through" : undefined}>
                  {t.title}
                  {(t.owner || t.due) && <span className="text-muted-foreground">{` · ${[t.owner || "Nobody", t.due ? `due ${shortDate(t.due)}` : ""].filter(Boolean).join(", ")}`}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </li>
  );
}

export interface DaySheetProps {
  /** "PRINCIPAL-A · Principal A" */
  who: string;
  day: SheetDay;
  zone: string;
}

export function DaySheet({ who, day, zone }: DaySheetProps) {
  return (
    <article className="flex flex-col gap-2 break-after-page last:break-after-auto" aria-label={longDate(day.date)} data-sheet-day={day.date}>
      <header className="flex items-baseline justify-between gap-4 pb-1">
        <h2 className="text-xl font-semibold">{longDate(day.date)}</h2>
        <p className="text-sm text-muted-foreground">{who}</p>
      </header>
      {day.entries.length === 0 ? (
        <p className="border-t py-3 text-sm text-muted-foreground">Nothing in the diary.</p>
      ) : (
        <ol className="border-b">
          {day.entries.map((entry) => <Entry key={entry.id} entry={entry} zone={zone} />)}
        </ol>
      )}
    </article>
  );
}
