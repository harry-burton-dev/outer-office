// The hover card on a diary block (OUT-85, v0.3 brief 8.1): hovering or focusing
// a block shows its full title, time, place, tags and categories, card progress,
// its clash partner and its place in its series ("3 of 8"). A masked engagement
// shows only its title and time.
import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDay, formatTime } from "@/domain/dates";
import type { Event } from "@/domain/selectors";
import type { EventFace } from "./calendar-data";
import { CLASH_LABELS, type CardShape } from "./event-face";

/** The lines of a block's hover card, in order. */
export function hoverLines(face: EventFace, event: Event | undefined, all: readonly Event[], shapes: readonly CardShape[], zone: string): string[] {
  if (!event?.start || !event.end) return [face.title];
  const when = event.allDay ? `${formatDay(event.start, zone)}, all day` : `${formatDay(event.start, zone)}, ${formatTime(event.start, zone)} to ${formatTime(event.end, zone)}`;
  const lines = [face.title, when];
  if (event.masked === true) return lines;
  if (event.location?.trim()) lines.push(event.location.trim());
  const labels = [...face.tags.map((t) => t.name ?? ""), ...(event.categories ?? "").split(",").map((c) => c.trim())].filter(Boolean);
  if (labels.length > 0) lines.push(labels.join(", "));
  if (shapes.length > 0) lines.push(`Cards: ${shapes.filter((s) => s.complete).length} of ${shapes.length} complete`);
  if (face.clash) lines.push(`${CLASH_LABELS[face.clash.severity]} with ${face.clash.with.join(", ")}`);
  const series = event.seriesId
    ? all.filter((e) => !e._deleted && e.gone !== true && e.principal === event.principal && e.seriesId === event.seriesId).sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))
    : [];
  const place = series.findIndex((e) => e.id === event.id);
  if (series.length > 1 && place >= 0) lines.push(`${place + 1} of ${series.length} in its series`);
  return lines;
}

/** Wraps a block in its hover card; `open` is for keyboard focus, which the card follows too. */
export function HoverCard({ lines, open, onOpenChange, children }: { lines: readonly string[]; open: boolean; onOpenChange(open: boolean): void; children: ReactElement }) {
  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" className="flex-col items-start gap-0.5" data-hover-card="">
        {lines.map((line, i) => <span key={i} className={i === 0 ? "font-medium" : undefined}>{line}</span>)}
      </TooltipContent>
    </Tooltip>
  );
}
