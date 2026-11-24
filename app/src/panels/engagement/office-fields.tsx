// The office's own fields on the Overview (OUT-84): priority, Quiet, and the
// Linked section: its parent, its children, or a suggested link.
import { useRecords } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/app/app-state";
import { childrenOf, isInside, suggestedParent } from "@/domain/clashes";
import { formatTime } from "@/domain/dates";
import type { Event } from "@/domain/selectors";
import { titleOf } from "@/screens/calendar/calendar-data";
import { NativeSelect } from "@/panels/task/native-select";
import { PRIORITY_OPTIONS } from "@/panels/task/field-options";
import type { OverlayState } from "./use-overlay";

const PRIORITY_LABELS = PRIORITY_OPTIONS.map((o) => (o.value === "4" ? { ...o, label: "P4 (none)" } : o));

function Priority({ overlay }: { overlay: OverlayState }) {
  const { isViewer } = useApp();
  const priority = overlay.overlay?.priority ?? 4;
  if (isViewer) return <p>{`Priority P${priority}`}</p>;
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor="engagement-priority">Priority</Label>
      <NativeSelect id="engagement-priority" className="w-28" options={PRIORITY_LABELS} value={String(priority)} onChange={(e) => overlay.save({ priority: Number(e.target.value) })} />
    </div>
  );
}

function Quiet({ overlay }: { overlay: OverlayState }) {
  const { isViewer } = useApp();
  const quiet = overlay.overlay?.quiet === true;
  if (isViewer) return quiet ? <p>Quiet: never clashes</p> : null;
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex flex-col">
        <Label htmlFor="engagement-quiet">Quiet</Label>
        <span className="text-xs text-muted-foreground">Never clashes, and shows only its Quiet mark</span>
      </span>
      <Switch id="engagement-quiet" aria-label="Quiet" checked={quiet} onCheckedChange={(checked) => overlay.save({ quiet: checked })} />
    </div>
  );
}

function Linked({ event, overlay }: { event: Event; overlay: OverlayState }) {
  const { timezone, isViewer, openPanel } = useApp();
  const events = useRecords("events", { where: (e) => e.principal === event.principal });
  const overlays = useRecords("overlays");
  const when = (e: Event) => `${formatTime(e.start ?? "", timezone)}–${formatTime(e.end ?? "", timezone)}`;
  const link = (e: Event) => (
    <button type="button" className="min-w-0 truncate text-left underline-offset-2 hover:underline" onClick={() => openPanel({ kind: "engagement", id: e.id })}>
      {`${when(e)} ${titleOf(e)}`}
    </button>
  );
  const parentId = overlay.overlay?.parent ?? "";
  const parent = parentId ? events.find((e) => e.id === parentId && !e._deleted) : undefined;
  const children = childrenOf(event.id, events, overlays);
  const suggested = suggestedParent(event, events, overlays, timezone);
  if (!parentId && children.length === 0 && !suggested) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Linked">
      <h3 className="text-sm text-muted-foreground">Linked</h3>
      {parentId && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 flex-col">
            <span className="text-muted-foreground">Inside</span>
            {parent ? link(parent) : <span>An engagement no longer in the diary</span>}
            {parent && !isInside(event, parent) && <span role="status" className="text-destructive">Outside its parent: Outlook moved it</span>}
          </span>
          {!isViewer && <Button variant="outline" size="sm" onClick={() => overlay.save({ parent: "" })}>Unlink</Button>}
        </div>
      )}
      {children.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-sm" aria-label="Linked under it">
          {children.map((c) => <li key={c.id} className="flex">{link(c)}</li>)}
        </ul>
      )}
      {suggested && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 flex-col">
            <span className="text-muted-foreground">Sits inside</span>
            {link(suggested)}
          </span>
          {!isViewer && <Button variant="outline" size="sm" onClick={() => overlay.save({ parent: suggested.id })}>Link under it</Button>}
        </div>
      )}
    </section>
  );
}

export function OfficeFields({ event, overlay }: { event: Event; overlay: OverlayState }) {
  return (
    <div className="flex flex-col gap-4">
      <Priority overlay={overlay} />
      <Quiet overlay={overlay} />
      <Linked event={event} overlay={overlay} />
    </div>
  );
}
