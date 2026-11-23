// Notes: the office's notes and outcome, each saved through overlay.set, then
// the follow-up tasks.
import { useApp } from "@/app/app-state";
import type { Event } from "@/domain/selectors";
import { BlurField } from "./blur-field";
import { FollowUps } from "./follow-ups";
import type { OverlayState } from "./use-overlay";

export interface PrepTabProps {
  event: Event;
  overlay: OverlayState;
}

/** The Notes tab. Prep's state and owner are no longer shown: cards replace them (OUT-62). */
export function PrepTab({ event, overlay }: PrepTabProps) {
  const { isViewer } = useApp();
  const current = overlay.overlay;
  return (
    <div className="flex flex-col gap-4">
      <BlurField label="Notes" multiline value={current?.notes ?? ""} readOnly={isViewer} onSave={(notes) => overlay.save({ notes })} />
      <BlurField label="Outcome" multiline value={current?.outcome ?? ""} readOnly={isViewer} onSave={(outcome) => overlay.save({ outcome })} />
      <FollowUps event={event} />
    </div>
  );
}
