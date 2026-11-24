// What sits inside one diary event: the subject, then its tags and up to two small marks.
import { ShapeIcon } from "@/cards/shape-icon";
import { TagDot } from "@/tags/tag-dot";
import { formatTime } from "@/domain/dates";
import type { ClashSeverity } from "@/domain/clashes";
import type { EventFace } from "./calendar-data";

/** How each clash severity reads, for the edge's label and the hover text. */
export const CLASH_LABELS: Record<ClashSeverity, string> = { hard: "Clash", soft: "Soft clash", away: "Clashes with time away" };
/** The clash edge's colour by severity: hard is the strongest. */
export const CLASH_EDGE: Record<ClashSeverity, string> = { hard: "bg-destructive", soft: "bg-amber-500", away: "bg-sky-500" };

/** A card on the meeting, as its template's shape: solid once complete, faint until then. */
export interface CardShape {
  id: string;
  shape: string | undefined;
  complete: boolean;
}

export interface EventFaceViewProps {
  face: EventFace;
  shapes?: readonly CardShape[];
  /** The meeting's times, shown small under the title. */
  time?: string;
  /** The office's zone, for the times of linked engagements drawn inside. */
  timeZone?: string;
}

export function EventFaceView({ face, shapes = [], time, timeZone = "UTC" }: EventFaceViewProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden" data-event-face="">
      {face.clash && (
        <span className="sr-only">{`${CLASH_LABELS[face.clash.severity]} with ${face.clash.with.join(", ")}`}</span>
      )}
      <span className="flex min-w-0 items-center gap-1">
        {face.priority && (
          <span data-priority={face.priority} className={face.priority === 1 ? "shrink-0 rounded-sm border-2 border-primary px-0.5 text-[0.6875rem] font-semibold" : "shrink-0 rounded-sm border border-muted-foreground/50 px-0.5 text-[0.6875rem]"}>
            {`P${face.priority}`}
          </span>
        )}
        {face.tags.slice(1).map((tag) => <TagDot key={tag.id} colour={tag.colour} />)}
        <span className="truncate font-medium">{face.lensText ?? face.title}</span>
        {shapes.length > 0 && (
          <span className="ml-auto flex shrink-0 gap-0.5" data-card-shapes="">
            {shapes.map((s) => <ShapeIcon key={s.id} shape={s.shape} className={s.complete ? "size-3.5" : "size-3.5 opacity-35"} />)}
          </span>
        )}
      </span>
      {time && <span className="truncate text-[0.6875rem] tabular-nums text-foreground/75">{time}</span>}
      {face.children && face.children.length > 0 && (
        <ol className="flex flex-col gap-px border-l border-foreground/30 pl-1" aria-label="Linked engagements" data-linked-children="">
          {face.children.map((child) => (
            <li key={child.id} className="truncate text-[0.6875rem]">
              <span className="tabular-nums text-foreground/75">{formatTime(child.start, timeZone)}</span> {child.title}
            </li>
          ))}
        </ol>
      )}
      {face.marks.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {face.marks.map((mark) => (
            <span key={mark} data-mark="" className="rounded-sm bg-background/80 px-1 text-[0.6875rem] text-muted-foreground">
              {mark}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
