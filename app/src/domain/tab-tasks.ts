// When a tab's tasks fall due (OUT-88): a number of days before the
// engagement's date in the office's time zone.
import type { RowOf } from "@trellis/framework";
import { addDays, dateIn } from "./dates";

type Event = Pick<RowOf<"events">, "start">;
type Task = RowOf<"tasks">;

/** The engagement's date in the zone: an all-day start is already a date. */
export const engagementDate = (event: Event, zone: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(event.start ?? "") ? event.start ?? "" : dateIn(event.start ?? "", zone);

/** The due date of a task offsetDays before the engagement. */
export const dueBefore = (event: Event, offsetDays: number, zone: string): string => addDays(engagementDate(event, zone), -offsetDays);

/** The engagement's open tab tasks whose due date no longer keeps their offset, as after the engagement moved. */
export const tasksOutOfStep = (event: Event & { id: string }, tasks: readonly Task[], zone: string): Task[] =>
  tasks.filter((t) => !t._deleted && !t.done && t.event === event.id && (t.tab ?? "") !== "" && t.due !== dueBefore(event, t.offsetDays ?? 0, zone));
