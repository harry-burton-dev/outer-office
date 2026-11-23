// Who the task is for: the state in words, with people by name, and only the
// actions this user may take now. The person is chosen from the active users.
import { useState, type FormEvent } from "react";
import { useField, type RowOf } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { usePeople } from "@/app/people";
import { PersonSelect } from "@/app/person-select";
import { commands } from "@/domain/commands";
import { ErrorLine } from "@/screens/tasks/list-parts";
import { useRun } from "@/screens/tasks/use-run";
import { assignChoices, describeAssignment, type AssignChoice } from "./assignment-state";
import { NeedsDecision } from "./needs-decision";

type Task = RowOf<"tasks">;

export interface AssignmentBlockProps {
  task: Task;
  userId: string;
  isViewer: boolean;
}

interface PersonPickerProps {
  choice: AssignChoice;
  onPick(person: string): void;
}

function PersonPicker({ choice, onPick }: PersonPickerProps) {
  const [person, setPerson] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (person !== "") onPick(person);
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <PersonSelect aria-label="Person" emptyLabel="Choose a person" value={person} onChange={setPerson} className="h-7 flex-1" />
      <Button type="submit" variant="outline" size="sm" disabled={person === ""}>{choice.label}</Button>
    </form>
  );
}

export function AssignmentBlock({ task, userId, isViewer }: AssignmentBlockProps) {
  const assign = useRun(commands.taskAssign);
  const assignee = useField("tasks", task.id, "assignee");
  const { nameOf } = usePeople();
  const choices = isViewer ? [] : assignChoices(task, userId);
  const act = (choice: AssignChoice, person?: string) => assign.run({ id: task.id, action: choice.action, assignee: person });
  return (
    <section aria-label="Assignment" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Assignment</h3>
      <p className="text-sm">
        {describeAssignment(task, nameOf)}
        {assignee.conflict && <NeedsDecision />}
      </p>
      {choices.length > 0 && (
        <div className="flex flex-col gap-2">
          {choices.filter((c) => c.needsPerson).map((c) => <PersonPicker key={c.label} choice={c} onPick={(p) => act(c, p)} />)}
          <div className="flex flex-wrap gap-2">
            {choices.filter((c) => !c.needsPerson).map((c) => (
              <Button key={c.label} variant="outline" size="sm" onClick={() => act(c)}>{c.label}</Button>
            ))}
          </div>
        </div>
      )}
      <ErrorLine error={assign.error} />
    </section>
  );
}
