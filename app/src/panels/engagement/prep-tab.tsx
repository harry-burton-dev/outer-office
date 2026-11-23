// Prep: the office's state, owner, notes and outcome, each saved through
// overlay.set, then the follow-up tasks.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/app/ui";
import { useApp } from "@/app/app-state";
import { usePeople } from "@/app/people";
import { PersonSelect } from "@/app/person-select";
import type { Event } from "@/domain/selectors";
import { BlurField } from "./blur-field";
import { FollowUps } from "./follow-ups";
import type { OverlayState } from "./use-overlay";
import { PREP_LABELS, prepOf, type PrepValue } from "./when";

export interface PrepTabProps {
  event: Event;
  overlay: OverlayState;
}

const PREP_ITEMS = (Object.keys(PREP_LABELS) as PrepValue[]).map((value) => ({ value, label: PREP_LABELS[value] }));

interface PrepSelectProps {
  value: PrepValue;
  onChange(value: PrepValue): void;
}

function PrepSelect({ value, onChange }: PrepSelectProps) {
  return (
    <Field label="Prep" htmlFor="engagement-prep">
      <Select items={PREP_ITEMS} value={value} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger id="engagement-prep" aria-label="Prep" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PREP_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

interface PrepOwnerProps {
  value: string;
  readOnly: boolean;
  onSave(userId: string): void;
}

function PrepOwner({ value, readOnly, onSave }: PrepOwnerProps) {
  const { nameOf } = usePeople();
  if (readOnly) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">Prep owner</span>
        <p>{value ? nameOf(value) : "None"}</p>
      </div>
    );
  }
  return (
    <Field label="Prep owner" htmlFor="engagement-prep-owner">
      <PersonSelect id="engagement-prep-owner" emptyLabel="None" value={value} onChange={(next) => next !== value && onSave(next)} />
    </Field>
  );
}

export function PrepTab({ event, overlay }: PrepTabProps) {
  const { isViewer } = useApp();
  const current = overlay.overlay;
  const prep = prepOf(current?.prep);
  return (
    <div className="flex flex-col gap-4">
      {isViewer ? (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">Prep</span>
          <p>{PREP_LABELS[prep]}</p>
        </div>
      ) : (
        <PrepSelect value={prep} onChange={(next) => overlay.save({ prep: next })} />
      )}
      <PrepOwner value={current?.prepOwner ?? ""} readOnly={isViewer} onSave={(prepOwner) => overlay.save({ prepOwner })} />
      <BlurField label="Notes" multiline value={current?.notes ?? ""} readOnly={isViewer} onSave={(notes) => overlay.save({ notes })} />
      <BlurField label="Outcome" multiline value={current?.outcome ?? ""} readOnly={isViewer} onSave={(outcome) => overlay.save({ outcome })} />
      <FollowUps event={event} />
    </div>
  );
}
