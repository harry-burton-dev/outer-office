// One card on a meeting: its template's form, saved field by field.
import { useCommand } from "@trellis/framework";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/app/ui";
import { useApp } from "@/app/app-state";
import { usePeople } from "@/app/people";
import { PersonSelect } from "@/app/person-select";
import { fieldsOf, isComplete, optionsOf, progressOf, valuesOf, type Card, type Template, type TemplateField } from "@/domain/cards";
import { commands } from "@/domain/commands";
import { BlurField } from "@/panels/engagement/blur-field";
import { NativeSelect } from "@/panels/task/native-select";
import { ShapeIcon } from "./shape-icon";

function Value({ field, value, readOnly, onSave }: { field: TemplateField; value: string; readOnly: boolean; onSave(value: string): void }) {
  const { nameOf } = usePeople();
  const label = field.required ? `${field.label} *` : field.label;
  if (field.type === "text" || field.type === "phone" || field.type === "email" || field.type === "longtext") {
    return <BlurField label={label} value={value} multiline={field.type === "longtext"} readOnly={readOnly} onSave={onSave} />;
  }
  if (field.type === "check") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={value === "true"} disabled={readOnly} onCheckedChange={(v) => onSave(v ? "true" : "")} />
        {label}
      </label>
    );
  }
  if (field.type === "person") {
    if (readOnly) return <Field label={label}><p>{value ? nameOf(value) : "None"}</p></Field>;
    return <Field label={label}><PersonSelect aria-label={field.label} emptyLabel="Nobody" value={value} onChange={onSave} /></Field>;
  }
  const options = optionsOf(field);
  const chosen = options.find((o) => o.label === value);
  return (
    <Field label={label}>
      {readOnly ? <p>{value || "None"}</p> : (
        <NativeSelect aria-label={field.label} options={[{ value: "", label: "Choose…" }, ...options.map((o) => ({ value: o.label, label: o.label }))]} value={value} onChange={(e) => onSave(e.target.value)} />
      )}
      {chosen?.detail && <p className="text-sm font-medium" data-choice-detail="">{chosen.detail}</p>}
    </Field>
  );
}

export function CardForm({ card, template }: { card: Card; template: Template | undefined }) {
  const { now, isViewer } = useApp();
  const set = useCommand(commands.cardSet);
  const remove = useCommand(commands.cardRemove);
  const fields = fieldsOf(template?.fields);
  const values = valuesOf(card.values);
  const progress = progressOf(fields, values);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShapeIcon shape={template?.shape} className={isComplete(progress) ? "size-4 text-foreground" : "size-4"} />
        <span className="flex-1">{template ? `${progress.done} of ${progress.total} done` : "This card's template has been removed."}</span>
        {!isViewer && <Button variant="ghost" size="sm" onClick={() => remove({ now, id: card.id })}><Trash2 />Remove card</Button>}
      </div>
      {fields.map((f) => (
        <Value key={`${card.id}-${f.id}`} field={f} value={values[f.id] ?? ""} readOnly={isViewer} onSave={(v) => set({ now, id: card.id, values: { [f.id]: v } })} />
      ))}
    </div>
  );
}
