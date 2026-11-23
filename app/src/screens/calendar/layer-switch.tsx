// Up and down through the diary's layers: Proposed above the live diary, the
// graveyard of events gone from Outlook below it.
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LAYER_NAMES, LAYERS, type Layer } from "./calendar-data";

export interface LayerSwitchProps {
  value: Layer;
  onChange(layer: Layer): void;
}

export function LayerSwitch({ value, onChange }: LayerSwitchProps) {
  const at = LAYERS.indexOf(value);
  const above = LAYERS[at - 1];
  const below = LAYERS[at + 1];
  return (
    <div className="flex items-center gap-1" data-layer-switch="">
      <span className="min-w-24 text-right text-sm font-medium" aria-live="polite">{LAYER_NAMES[value]}</span>
      <div className="flex flex-col">
        <Button variant="ghost" size="icon-xs" className="h-5" disabled={!above} onClick={() => above && onChange(above)} aria-label={above ? `Up to ${LAYER_NAMES[above]}` : "Up"}>
          <ChevronUpIcon />
        </Button>
        <Button variant="ghost" size="icon-xs" className="h-5" disabled={!below} onClick={() => below && onChange(below)} aria-label={below ? `Down to ${LAYER_NAMES[below]}` : "Down"}>
          <ChevronDownIcon />
        </Button>
      </div>
    </div>
  );
}
