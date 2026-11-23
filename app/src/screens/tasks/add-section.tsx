// "Add section": a quiet button that becomes an inline name field.
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commands } from "@/domain/commands";
import { ErrorLine } from "./list-parts";
import { useRun } from "./use-run";

export interface AddSectionProps {
  projectId: string;
}

export function AddSection({ projectId }: AddSectionProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const save = useRun(commands.sectionSave);
  const stop = () => {
    setEditing(false);
    setName("");
    save.clearError();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") return stop();
    if (save.run({ project: projectId, name: name.trim() })) stop();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") stop();
  };
  if (!editing) return <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Add section</Button>;
  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <Input
        autoFocus
        aria-label="Section name"
        placeholder="Section name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => name.trim() === "" && stop()}
        className="h-7 w-48"
      />
      <ErrorLine error={save.error} />
    </form>
  );
}
