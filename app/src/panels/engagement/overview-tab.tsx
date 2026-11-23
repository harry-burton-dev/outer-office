// Overview: Outlook's fields, read-only, and the office's flag.
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/app/app-state";
import type { Event } from "@/domain/selectors";
import type { OverlayState } from "./use-overlay";
import { instantText } from "./when";

export interface OverviewTabProps {
  event: Event;
  overlay: OverlayState;
}

interface Detail {
  label: string;
  value: string;
}

const SHOWS_AS: Record<string, string> = { busy: "Busy", tentative: "Tentative", free: "Free", oof: "Out of office" };

function details(event: Event, zone: string): Detail[] {
  const all: Detail[] = [
    { label: "Where", value: event.location ?? "" },
    { label: "Organiser", value: event.organizer ?? "" },
    { label: "Categories", value: event.categories ?? "" },
    { label: "Shows as", value: SHOWS_AS[event.showAs ?? ""] ?? event.showAs ?? "" },
    { label: "Last changed in Outlook", value: event.sourceModified ? instantText(event.sourceModified, zone) : "" },
  ];
  return all.filter((d) => d.value.trim() !== "");
}

const movedText = (moves: number): string => `Moved ${moves} ${moves === 1 ? "time" : "times"}`;

interface OutlookFieldsProps {
  event: Event;
}

function OutlookFields({ event }: OutlookFieldsProps) {
  const { timezone } = useApp();
  if (event.masked === true) return null;
  const moves = event.moves ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {details(event, timezone).map((d) => (
          <div key={d.label} className="contents">
            <dt className="text-muted-foreground">{d.label}</dt>
            <dd>{d.value}</dd>
          </div>
        ))}
      </dl>
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
    </div>
  );
}
