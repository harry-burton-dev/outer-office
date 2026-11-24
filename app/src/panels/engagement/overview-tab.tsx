// Overview: Outlook's fields, read-only, and the office's flag, priority, Quiet and links.
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/app/app-state";
import type { Event } from "@/domain/selectors";
import type { OverlayState } from "./use-overlay";
import { instantText } from "./when";
import { OfficeFields } from "./office-fields";

export interface OverviewTabProps {
  event: Event;
  overlay: OverlayState;
}

interface Detail {
  label: string;
  value: string;
}

const SHOWS_AS: Record<string, string> = { busy: "Busy", tentative: "Tentative", free: "Free", oof: "Out of office" };

const CAPITAL = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** Every field the diary sync carries, in the order Outlook shows them. Empty ones are left out. */
function details(event: Event, zone: string): Detail[] {
  const all: Detail[] = [
    { label: "Where", value: event.location ?? "" },
    { label: "Organiser", value: event.organizer ?? "" },
    { label: "Categories", value: event.categories ?? "" },
    { label: "Shows as", value: SHOWS_AS[event.showAs ?? ""] ?? event.showAs ?? "" },
    { label: "Importance", value: CAPITAL(event.importance ?? "") },
    { label: "Sensitivity", value: CAPITAL(event.sensitivity ?? "") },
    { label: "Series", value: event.recurrenceId ? "One meeting in a series" : "" },
    { label: "Created", value: event.created ? instantText(event.created, zone) : "" },
    { label: "Last changed in Outlook", value: event.sourceModified ? instantText(event.sourceModified, zone) : "" },
  ];
  return all.filter((d) => d.value.trim() !== "");
}

const movedText = (moves: number): string => `Moved ${moves} ${moves === 1 ? "time" : "times"}`;

interface AttendeeListProps {
  title: string;
  lines: string;
}

/** "Name <address> · response" lines, with the response set apart. */
function AttendeeList({ title, lines }: AttendeeListProps) {
  const people = lines.split("\n").filter((line) => line.trim() !== "");
  if (people.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm text-muted-foreground">{`${title} (${people.length})`}</h3>
      <ul className="flex flex-col gap-0.5">
        {people.map((line) => {
          const [who = "", response = ""] = line.split(" · ");
          return (
            <li key={line} className="flex justify-between gap-4 text-sm">
              <span className="min-w-0 truncate" title={who}>{who.replace(/ <.*>$/, "")}</span>
              {response && <span className="shrink-0 text-muted-foreground">{response}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface OutlookFieldsProps {
  event: Event;
}

function OutlookFields({ event }: OutlookFieldsProps) {
  const { timezone } = useApp();
  if (event.masked === true) return null;
  const moves = event.moves ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {details(event, timezone).map((d) => (
          <div key={d.label} className="contents">
            <dt className="text-muted-foreground">{d.label}</dt>
            <dd>{d.value}</dd>
          </div>
        ))}
      </dl>
      <AttendeeList title="Required" lines={event.requiredAttendees ?? ""} />
      <AttendeeList title="Optional" lines={event.optionalAttendees ?? ""} />
      {moves > 0 && <p>{movedText(moves)}</p>}
      <p className="text-xs text-muted-foreground">Change this in Outlook, then import again</p>
    </div>
  );
}

interface FlagProps {
  overlay: OverlayState;
}

function Flag({ overlay }: FlagProps) {
  const { isViewer } = useApp();
  const flagged = overlay.overlay?.flagged === true;
  if (isViewer) return <p>{flagged ? "Flagged" : "Not flagged"}</p>;
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor="engagement-flag">Flag</Label>
      <Switch id="engagement-flag" aria-label="Flag" checked={flagged} onCheckedChange={(checked) => overlay.save({ flagged: checked })} />
    </div>
  );
}

export function OverviewTab({ event, overlay }: OverviewTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <OutlookFields event={event} />
      <Flag overlay={overlay} />
      <OfficeFields event={event} overlay={overlay} />
    </div>
  );
}
