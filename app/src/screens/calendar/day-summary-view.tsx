// The day summary on a day header (OUT-84): small marks that say whether the
// day is workable, each with its full meaning for hover and screen readers.
import { AlarmClockIcon, Link2OffIcon, MapPinIcon, MoonIcon, SunriseIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { hasWarnings, type DaySummary } from "@/domain/day-summary";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const hours = (minutes: number) => `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;

interface Item {
  key: string;
  icon: ReactNode;
  short: string;
  label: string;
  tone: string;
}

/** What the summary says, most serious first. */
export function summaryItems(s: DaySummary): Item[] {
  const items: Item[] = [];
  if (s.clashes.hard) items.push({ key: "hard", icon: <TriangleAlertIcon />, short: String(s.clashes.hard), label: plural(s.clashes.hard, "clash", "clashes"), tone: "text-destructive" });
  if (s.clashes.soft) items.push({ key: "soft", icon: <TriangleAlertIcon />, short: String(s.clashes.soft), label: plural(s.clashes.soft, "soft clash", "soft clashes"), tone: "text-amber-600 dark:text-amber-400" });
  if (s.clashes.away) items.push({ key: "away", icon: <TriangleAlertIcon />, short: String(s.clashes.away), label: plural(s.clashes.away, "clash with time away", "clashes with time away"), tone: "text-sky-600 dark:text-sky-400" });
  if (s.linkedOutside) items.push({ key: "outside", icon: <Link2OffIcon />, short: String(s.linkedOutside), label: plural(s.linkedOutside, "linked engagement outside its parent", "linked engagements outside their parent"), tone: "text-destructive" });
  if (s.placeChanges) items.push({ key: "place", icon: <MapPinIcon />, short: String(s.placeChanges), label: `${plural(s.placeChanges, "quick change", "quick changes")} of place`, tone: "text-muted-foreground" });
  if (s.longRun) items.push({ key: "run", icon: <AlarmClockIcon />, short: hours(s.longRun), label: `${hours(s.longRun)} without a break`, tone: "text-muted-foreground" });
  if (s.early) items.push({ key: "early", icon: <SunriseIcon />, short: s.early, label: `Starts at ${s.early}, before the working day`, tone: "text-muted-foreground" });
  if (s.late) items.push({ key: "late", icon: <MoonIcon />, short: s.late, label: `Ends at ${s.late}, after the working day`, tone: "text-muted-foreground" });
  return items;
}

const CLASH_KEYS = new Set(["hard", "soft", "away"]);

/** With onClashes, each clash count is a button that opens the clash wizard for the day (OUT-85). */
export function DaySummaryView({ summary, onClashes }: { summary: DaySummary; onClashes?: () => void }) {
  if (!hasWarnings(summary)) return null;
  const items = summaryItems(summary);
  return (
    <ul className="mt-1 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[0.6875rem] tabular-nums normal-case" aria-label="Day summary" data-day-summary="">
      {items.map((item) => {
        const content = (
          <>
            {item.icon}
            <span aria-hidden>{item.short}</span>
            <span className="sr-only">{item.label}</span>
          </>
        );
        return (
          <li key={item.key} title={item.label} className={`flex items-center gap-0.5 [&_svg]:size-3 ${item.tone}`} data-summary={item.key}>
            {onClashes && CLASH_KEYS.has(item.key) ? (
              <button
                type="button"
                className="flex items-center gap-0.5 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                title={`${item.label}: open the clash wizard`}
                onClick={(e) => { e.stopPropagation(); onClashes(); }}
                data-open-wizard=""
              >
                {content}
              </button>
            ) : content}
          </li>
        );
      })}
    </ul>
  );
}
