// Test-only commands for task screens: write records as another user would
// have, which the one-device harness can't do with the real commands.
import { defineCommand, type Tx } from "@trellis/framework";

export interface PutTaskInput {
  id?: string;
  fields: Record<string, string | number | boolean>;
}

/** Writes a task with exactly these fields; returns its id. */
export const putTask = defineCommand("test.tasks.put", (tx: Tx, input: PutTaskInput) => {
  const id = input.id ?? tx.newId();
  tx.put("tasks", id, input.fields);
  return id;
});

/** Writes another user's Inbox project; returns its id. */
export const putInbox = defineCommand("test.tasks.putInbox", (tx: Tx, input: { userId: string }) => {
  const id = tx.id("inbox", input.userId);
  tx.put("projects", id, { name: "Inbox", owner: input.userId, order: 0, inbox: true, archived: false });
  return id;
});
