// The event's overlay (or undefined until there is one) and a save that runs
// overlay.set, keeping the last error to show inline.
import { useState } from "react";
import { useCommand, useRecords } from "@trellis/framework";
import { commands, type OverlaySetInput } from "@/domain/commands";
import type { Overlay } from "@/domain/selectors";
import { useApp } from "@/app/app-state";

export type OverlayFields = Omit<OverlaySetInput, "now" | "event">;

export interface OverlayState {
  overlay: Overlay | undefined;
  save(fields: OverlayFields): void;
  error: string;
}

export function useOverlay(eventId: string): OverlayState {
  const { now } = useApp();
  const overlays = useRecords("overlays", { where: (o) => o.event === eventId });
  const run = useCommand(commands.overlaySet);
  const [error, setError] = useState("");
  const save = (fields: OverlayFields) => {
    const result = run({ now,event: eventId, ...fields });
    setError(result.ok ? "" : result.error);
  };
  return { overlay: overlays[0], save, error };
}
