// What sits inside one diary event: the subject, then up to two small marks.
import type { EventFace } from "./calendar-data";

export interface EventFaceViewProps {
  face: EventFace;
}

export function EventFaceView({ face }: EventFaceViewProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 overflow-hidden" data-event-face="">
      <span className="truncate">{face.title}</span>
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
