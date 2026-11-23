// A select of the active people, by name, that stores a user id. A stored id
// that is no longer offered (an inactive user) stays as an option so it still reads.
import type { ComponentProps } from "react";
import { NativeSelect, type SelectOption } from "@/panels/task/native-select";
import { activePeople, usePeople, type People } from "./people";

/** "" (with `emptyLabel`) first, then the active people by name, then `current` if it is not among them. */
export function personOptions(people: People, current: string, emptyLabel: string): SelectOption[] {
  const active = activePeople(people).map((user) => ({ value: user.id, label: user.name }));
  const kept = current !== "" && !active.some((o) => o.value === current) ? [{ value: current, label: people.nameOf(current) }] : [];
  return [{ value: "", label: emptyLabel }, ...active, ...kept];
}

export interface PersonSelectProps extends Omit<ComponentProps<"select">, "children" | "value" | "onChange"> {
  value: string;
  onChange(userId: string): void;
  /** What the empty choice says, such as "None". */
  emptyLabel: string;
}

export function PersonSelect({ value, onChange, emptyLabel, ...props }: PersonSelectProps) {
  const people = usePeople();
  return <NativeSelect {...props} options={personOptions(people, value, emptyLabel)} value={value} onChange={(e) => onChange(e.target.value)} />;
}
