// project.save and section.save: create, rename, reorder, archive.
import { defineCommand, type Tx } from "@trellis/framework";
import { defined, optionalBoolean, optionalNumber, requireNow, requireText } from "./shared";

export const INBOX_NAME = "Inbox";

/** The caller's Inbox id. */
export const inboxId = (tx: Tx, userId: string): string => tx.id("inbox", userId);

/** Writes the caller's Inbox if this run's snapshot does not have it. Returns its id. */
export function ensureInbox(tx: Tx): string {
  const id = inboxId(tx, tx.user);
  const current = tx.get("projects", id);
  if (current && !current._deleted) return id;
  if (current?._deleted) tx.restore("projects", id);
  tx.put("projects", id, { name: INBOX_NAME, owner: tx.user, order: 0, inbox: true, archived: false });
  return id;
}

export interface ProjectSaveInput {
  now: string;
  /** Leave out to create. */
  id?: string;
  name?: string;
  order?: number;
  archived?: boolean;
}

export const projectSave = defineCommand("project.save", (tx: Tx, input: ProjectSaveInput) => {
  requireNow(tx, input);
  const fields = defined({
    name: input.name === undefined ? undefined : requireText(tx, input.name, "The project name"),
    order: optionalNumber(tx, input.order, "The order"),
    archived: optionalBoolean(tx, input.archived, "Archived"),
  });
  if (input.id === undefined) {
    if (fields.name === undefined) tx.fail("A new project needs a name.");
    const order = fields.order ?? Math.max(0, ...tx.list("projects").map((p) => p.order ?? 0)) + 1;
    const id = tx.newId();
    tx.put("projects", id, { name: fields.name, owner: tx.user, order, inbox: false, archived: fields.archived ?? false });
    return id;
  }
  const current = tx.get("projects", input.id);
  if (!current || current._deleted) tx.fail("That project no longer exists.");
  if (current.inbox && fields.archived) tx.fail("An Inbox can't be archived.");
  tx.put("projects", input.id, fields);
  return input.id;
});

export interface SectionSaveInput {
  now: string;
  /** Leave out to create. */
  id?: string;
  /** Needed to create; a section can't change project. */
  project?: string;
  name?: string;
  order?: number;
}

export const sectionSave = defineCommand("section.save", (tx: Tx, input: SectionSaveInput) => {
  requireNow(tx, input);
  const name = input.name === undefined ? undefined : requireText(tx, input.name, "The section name");
  const order = optionalNumber(tx, input.order, "The order");
  if (input.id === undefined) {
    const projectId = requireText(tx, input.project, "The section's project");
    const project = tx.get("projects", projectId);
    if (!project || project._deleted) tx.fail("That project no longer exists.");
    if (name === undefined) tx.fail("A new section needs a name.");
    const siblings = tx.list("sections").filter((s) => s.project === projectId);
    const id = tx.newId();
    tx.put("sections", id, { project: projectId, name, order: order ?? Math.max(0, ...siblings.map((s) => s.order ?? 0)) + 1 });
    return id;
  }
  const current = tx.get("sections", input.id);
  if (!current || current._deleted) tx.fail("That section no longer exists.");
  if (input.project !== undefined && input.project !== current.project) tx.fail("A section can't move to another project.");
  tx.put("sections", input.id, defined({ name, order }));
  return input.id;
});
