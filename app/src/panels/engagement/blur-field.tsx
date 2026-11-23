// A text input or textarea that keeps a draft while focused and saves on blur
// when the text changed. A viewer sees the stored text only.
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/app/ui";

export interface BlurFieldProps {
  label: string;
  value: string;
  multiline?: boolean;
  readOnly: boolean;
  onSave(value: string): void;
}

export function BlurField({ label, value, multiline = false, readOnly, onSave }: BlurFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  if (readOnly) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">{label}</span>
        <p className="whitespace-pre-wrap">{value || "None"}</p>
      </div>
    );
  }
  const shown = draft ?? value;
  const commit = () => {
    if (draft !== null && draft !== value) onSave(draft);
    setDraft(null);
  };
  const common = { id, value: shown, onBlur: commit };
  return (
    <Field label={label} htmlFor={id}>
      {multiline ? (
        <Textarea {...common} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <Input {...common} onChange={(e) => setDraft(e.target.value)} />
      )}
    </Field>
  );
}
