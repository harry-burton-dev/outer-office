// What sits inside one diary event: the subject, then its tags and up to two small marks.
import { ShapeIcon } from "@/cards/shape-icon";
import { TagDot } from "@/tags/tag-dot";
import type { EventFace } from "./calendar-data";

/** A card on the meeting, as its template's shape: solid once complete, faint until then. */
export interface CardShape {
  id: string;
  shape: string | undefined;
  complete: boolean;
}

export interface EventFaceViewProps {
  face: EventFace;
  shapes?: readonly CardShape[];
}

export function EventFaceView({ face, shapes = [] }: EventFaceViewProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 overflow-hidden" data-event-face="">
      <span className="flex min-w-0 items-center gap-1">
        {face.tags.slice(1).map((tag) => <TagDot key={tag.id} colour={tag.colour} />)}
        <span className="truncate">{face.lensText ?? face.title}</span>
        {shapes.length > 0 && (
          <span className="ml-auto flex shrink-0 gap-0.5" data-card-shapes="">
            {shapes.map((s) => <ShapeIcon key={s.id} shape={s.shape} className={s.complete ? "size-3.5" : "size-3.5 opacity-35"} />)}
          </span>
        )}
      </span>
      {face.marks.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {face.marks.map((mark) => (
            <span key={mark} data-mark="" className="rounded-sm bg-background/70 px-1 text-xs text-foreground">
              {mark}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
