// Step one: the principal (as text) and the file: .ics, or Outlook's CSV export
// as a fallback. Reading the file is the caller's job; this only hands it over.
import { useRef, type RefObject } from "react";
import { Button } from "@/components/ui/button";

export interface ChooseStepProps {
  principalLabel: string;
  /** Shown as an error under the button. */
  errors: readonly string[];
  busy: boolean;
  onFile(file: File): void;
  onCsvFile(file: File): void;
}

function FileInput({ label, accept, onFile, inputRef }: { label: string; accept: string; onFile(file: File): void; inputRef: RefObject<HTMLInputElement | null> }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      aria-label={label}
      tabIndex={-1}
      className="sr-only"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) onFile(file);
      }}
    />
  );
}

export function ChooseStep({ principalLabel, errors, busy, onFile, onCsvFile }: ChooseStepProps) {
  const input = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  return (
    <section aria-label="Choose file" className="flex flex-col gap-4">
      <p className="text-sm">For {principalLabel}</p>
      <FileInput label="Calendar file" accept=".ics,text/calendar" onFile={onFile} inputRef={input} />
      <FileInput label="CSV file" accept=".csv,text/csv" onFile={onCsvFile} inputRef={csvInput} />
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => input.current?.click()}>
          Choose .ics file
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => csvInput.current?.click()}>
          Choose CSV file
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Use these when the diary sync isn't working. CSV is Outlook's Import/Export, Comma Separated Values. It has no event
        IDs, so prefer .ics.
      </p>
      {errors.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
    </section>
  );
}
