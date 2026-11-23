// Who the task is for: the state in words, and only the actions this user may
// take now. People are typed as user ids, with the ids the records already
// mention offered as suggestions (the framework's users table is not readable here).
import { useId, useState, type FormEvent } from "react";
import { useField, type RowOf } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commands } from "@/domain/commands";
import { useKnownUsers } from "@/screens/tasks/people";
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
  userId: string;
  onPick(person: string): void;
}

function PersonPicker({ choice, userId, onPick }: PersonPickerProps) {
  const [person, setPerson] = useState("");
  const listId = useId();
  const people = useKnownUsers(userId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (person.trim() !== "") onPick(person.trim());
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input aria-label="Person" placeholder="User id" list={listId} value={person} onChange={(e) => setPerson(e.target.value)} className="h-7 flex-1" />
      <datalist id={listId}>{people.map((id) => <option key={id} value={id} />)}</datalist>
      <Button type="submit" variant="outline" size="sm" disabled={person.trim() === ""}>{choice.label}</Button>
    </form>
  );
}

export function AssignmentBlock({ task, userId, isViewer }: AssignmentBlockProps) {
  const assign = useRun(commands.taskAssign);
  const assignee = useField("tasks", task.id, "assignee");
  const choices = isViewer ? [] : assignChoices(task, userId);
  const act = (choice: AssignChoice, person?: string) => assign.run({ id: task.id, action: choice.action, assignee: person });
  return (
    <section aria-label="Assignment" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Assignment</h3>
      <p className="text-sm">
        {describeAssignment(task)}
        {assignee.conflict && <NeedsDecision />}
      </p>
      {choices.length > 0 && (
        <div className="flex flex-col gap-2">
          {choices.filter((c) => c.needsPerson).map((c) => <PersonPicker key={c.label} choice={c} userId={userId} onPick={(p) => act(c, p)} />)}
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
