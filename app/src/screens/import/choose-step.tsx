// Step one: the principal (as text) and the .ics file. Reading the file is the
// caller's job; this only hands it over.
import { useRef } from "react";
import { Button } from "@/components/ui/button";

export interface ChooseStepProps {
  principalLabel: string;
  /** Shown as an error under the button. */
  errors: readonly string[];
  busy: boolean;
  onFile(file: File): void;
}

export function ChooseStep({ principalLabel, errors, busy, onFile }: ChooseStepProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section aria-label="Choose file" className="flex flex-col gap-4">
      <p className="text-sm">For {principalLabel}</p>
      <input
        ref={input}
        type="file"
        accept=".ics,text/calendar"
        aria-label="Calendar file"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <div>
        <Button disabled={busy} onClick={() => input.current?.click()}>
          Choose .ics file
        </Button>
      </div>
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
