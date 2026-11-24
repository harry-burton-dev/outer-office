// Overview: Outlook's fields, read-only, and the office's flag, priority, Quiet and links.
// The body is plain text, shown as text (never as markup), and "All Outlook
// fields" lists the item as received (OUT-83). A masked item shows none of it.
import { useRecords } from "@trellis/framework";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/app/app-state";
import type { Event } from "@/domain/selectors";
import type { OverlayState } from "./use-overlay";
import { instantText } from "./when";
import { fieldSource, SOURCE_NAMES } from "@/domain/field-sources";
import { outlookFieldsOf, safeLink } from "./outlook-fields";
import { OfficeFields } from "./office-fields";

export interface OverviewTabProps {
  event: Event;
  overlay: OverlayState;
}

interface Detail {
  label: string;
  value: string;
  /** The events field it shows, for its source and age. */
  field: string;
}

const SHOWS_AS: Record<string, string> = { busy: "Busy", tentative: "Tentative", free: "Free", oof: "Out of office" };

const CAPITAL = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const RESPONSE_TEXT: Record<string, string> = {
  accepted: "Accepted", tentative: "Tentative", declined: "Declined", "no response": "Not answered", organizer: "Organiser",
};

/** Every field the diary sync carries, in the order Outlook shows them. Empty ones are left out. */
function details(event: Event, zone: string): Detail[] {
  const all: Detail[] = [
    { label: "Where", value: event.location ?? "", field: "location" },
    { label: "Organiser", value: event.organizer ?? "", field: "organizer" },
    { label: "Response", value: RESPONSE_TEXT[event.response ?? ""] ?? "", field: "response" },
    { label: "Categories", value: event.categories ?? "", field: "categories" },
    { label: "Shows as", value: SHOWS_AS[event.showAs ?? ""] ?? event.showAs ?? "", field: "showAs" },
    { label: "Importance", value: CAPITAL(event.importance ?? ""), field: "importance" },
    { label: "Sensitivity", value: CAPITAL(event.sensitivity ?? ""), field: "sensitivity" },
    { label: "Series", value: event.recurrenceId ? (event.kind === "exception" ? "Changed from its series" : "One meeting in a series") : "", field: "kind" },
    { label: "Attachments", value: event.hasAttachments === true ? "Has attachments in Outlook" : "", field: "hasAttachments" },
    { label: "Created", value: event.created ? instantText(event.created, zone) : "", field: "created" },
    { label: "Last changed in Outlook", value: event.sourceModified ? instantText(event.sourceModified, zone) : "", field: "sourceModified" },
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
  const history = useRecords("eventHistory");
  const imports = useRecords("imports");
  if (event.masked === true) return null;
  const moves = event.moves ?? 0;
  const sourceText = (field: string) => {
    const from = fieldSource(field, event, history, imports);
    return from ? `From ${SOURCE_NAMES[from.source] ?? "an import"}, ${instantText(from.at, timezone)}` : undefined;
  };
  const join = safeLink(event.joinUrl);
  const open = safeLink(event.webLink);
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {details(event, timezone).map((d) => (
          <div key={d.label} className="contents">
            <dt className="text-muted-foreground">{d.label}</dt>
            <dd title={sourceText(d.field)}>{d.value}</dd>
          </div>
        ))}
      </dl>
      {(join || open) && (
        <div className="flex flex-wrap gap-3 text-sm">
          {join && <a className="underline" href={join} target="_blank" rel="noreferrer">Join the online meeting</a>}
          {open && <a className="underline" href={open} target="_blank" rel="noreferrer">Open in Outlook</a>}
        </div>
      )}
      <AttendeeList title="Required" lines={event.requiredAttendees ?? ""} />
      <AttendeeList title="Optional" lines={event.optionalAttendees ?? ""} />
      {moves > 0 && <p>{movedText(moves)}</p>}
      {event.body && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm text-muted-foreground">Body</h3>
          <p className="whitespace-pre-wrap break-words text-sm" title={sourceText("body")}>{event.body}</p>
        </div>
      )}
      <AllOutlookFields raw={event.raw ?? ""} />
      <p className="text-xs text-muted-foreground">Change this in Outlook, then import again</p>
    </div>
  );
}

/** Every key of the item as received, except a few kept internal (B1). Values are shown as text. */
function AllOutlookFields({ raw }: { raw: string }) {
  const fields = outlookFieldsOf(raw);
  if (fields.length === 0) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">All Outlook fields</summary>
      <dl aria-label="All Outlook fields" className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {fields.map((f) => (
          <div key={f.key} className="contents">
            <dt className="text-muted-foreground">{f.key}</dt>
            <dd className="whitespace-pre-wrap break-all font-mono text-xs">{f.value}</dd>
          </div>
        ))}
      </dl>
    </details>
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
