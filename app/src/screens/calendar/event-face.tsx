// What sits inside one diary event: the subject, then its tags and up to two small marks.
import { TagDot } from "@/tags/tag-dot";
import type { EventFace } from "./calendar-data";

export interface EventFaceViewProps {
  face: EventFace;
}

export function EventFaceView({ face }: EventFaceViewProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 overflow-hidden" data-event-face="">
      <span className="flex min-w-0 items-center gap-1">
        {face.tags.slice(1).map((tag) => <TagDot key={tag.id} colour={tag.colour} />)}
        <span className="truncate">{face.title}</span>
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
