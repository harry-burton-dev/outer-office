// Quick add's names to ids, case-insensitively: the project by name (the
// shared project or "inbox"), the section within that project, the principal
// by code, the person against the known user ids (kept as typed when unknown,
// since the users table is not readable from the app). A name that can't be
// resolved is reported and left out of the task.
import type { RowOf } from "@trellis/framework";
import type { QuickAdd } from "@/domain/quick-add";
import type { TaskAddInput } from "@/domain/commands";

type Project = RowOf<"projects">;
type Section = RowOf<"sections">;
type Principal = RowOf<"principals">;

export type ChipKind = "project" | "section" | "priority" | "person" | "principal" | "due" | "deadline";

export interface Chip {
  kind: ChipKind;
  /** What to show: the resolved name, or the text as typed when not found. */
  label: string;
  found: boolean;
}

export interface ResolveContext {
  shared: Project | undefined;
  /** The user's Inbox, when it exists. */
  inbox: Project | undefined;
  sections: readonly Section[];
  principals: readonly Principal[];
  users: readonly string[];
}

export interface Resolved {
  input: Omit<TaskAddInput, "now">;
  chips: Chip[];
}

const same = (a: string | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

interface Place {
  project?: string;
  chip?: Chip;
}

function resolveProject(name: string | undefined, context: ResolveContext): Place & { lookIn?: string } {
  if (name === undefined) return { lookIn: context.inbox?.id };
  if (same("inbox", name)) return { lookIn: context.inbox?.id, chip: { kind: "project", label: "Inbox", found: true } };
  if (context.shared && same(context.shared.name, name)) {
    return { project: context.shared.id, lookIn: context.shared.id, chip: { kind: "project", label: context.shared.name ?? name, found: true } };
  }
  return { chip: { kind: "project", label: name, found: false } };
}

function resolveSection(name: string | undefined, projectId: string | undefined, sections: readonly Section[]) {
  if (name === undefined) return {};
  const found = projectId === undefined ? undefined : sections.find((s) => !s._deleted && s.project === projectId && same(s.name, name));
  const chip: Chip = { kind: "section", label: found?.name ?? name, found: found !== undefined };
  return { section: found?.id, chip };
}

function resolvePrincipal(code: string | undefined, principals: readonly Principal[]) {
  if (code === undefined) return {};
  const found = principals.find((p) => !p._deleted && p.active === true && same(p.code, code));
  const chip: Chip = { kind: "principal", label: found?.code ?? code, found: found !== undefined };
  return { principal: found?.id, chip };
}

function resolvePerson(name: string | undefined, users: readonly string[]) {
  if (name === undefined) return {};
  const assignee = users.find((u) => same(u, name)) ?? name;
  return { assignee, chip: { kind: "person", label: assignee, found: true } satisfies Chip };
}

export function resolveQuickAdd(parsed: QuickAdd, context: ResolveContext): Resolved {
  const place = resolveProject(parsed.project, context);
  const section = resolveSection(parsed.section, place.lookIn, context.sections);
  const principal = resolvePrincipal(parsed.principal, context.principals);
  const person = resolvePerson(parsed.assignee, context.users);
  const chips: (Chip | undefined)[] = [
    place.chip,
    section.chip,
    parsed.priority === undefined ? undefined : { kind: "priority", label: `P${parsed.priority}`, found: true },
    person.chip,
    principal.chip,
    parsed.due === undefined ? undefined : { kind: "due", label: parsed.due, found: true },
    parsed.deadline === undefined ? undefined : { kind: "deadline", label: parsed.deadline, found: true },
  ];
  const input: Omit<TaskAddInput, "now"> = {
    title: parsed.title,
    ...(place.project === undefined ? {} : { project: place.project }),
    ...(section.section === undefined ? {} : { section: section.section }),
    ...(parsed.priority === undefined ? {} : { priority: parsed.priority }),
    ...(person.assignee === undefined ? {} : { assignee: person.assignee }),
    ...(principal.principal === undefined ? {} : { principal: principal.principal }),
    ...(parsed.due === undefined ? {} : { due: parsed.due }),
    ...(parsed.deadline === undefined ? {} : { deadline: parsed.deadline }),
  };
  return { input, chips: chips.filter((c): c is Chip => c !== undefined) };
}
