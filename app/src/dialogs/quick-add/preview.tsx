// What quick add understood: the title, then a chip for each part present.
import { Badge } from "@/components/ui/badge";
import { DateText } from "@/app/ui";
import type { Chip, ChipKind } from "./resolve";

const NAMES: Record<ChipKind, string> = {
  project: "Project", section: "Section", priority: "Priority", person: "Person", principal: "Principal", due: "Due", deadline: "Deadline",
};

function ChipBadge({ chip }: { chip: Chip }) {
  const isDate = chip.kind === "due" || chip.kind === "deadline";
  const value = isDate ? <DateText value={chip.label} /> : chip.label;
  return (
    <Badge variant="secondary" data-testid={`chip-${chip.kind}`}>
      {chip.kind === "deadline" ? "Deadline " : ""}
      {chip.found ? value : <><s>{value}</s> not found</>}
      <span className="sr-only"> ({NAMES[chip.kind]})</span>
    </Badge>
  );
}

export interface QuickAddPreviewProps {
  title: string;
  chips: readonly Chip[];
}

export function QuickAddPreview({ title, chips }: QuickAddPreviewProps) {
  if (title === "" && chips.length === 0) return null;
  return (
    <div aria-label="Understood as" role="group" className="flex flex-col gap-2">
      <p className="text-sm" data-testid="preview-title">{title || <span className="text-muted-foreground">No title yet</span>}</p>
      {chips.length > 0 && <div className="flex flex-wrap gap-1">{chips.map((c) => <ChipBadge key={c.kind} chip={c} />)}</div>}
    </div>
  );
}
