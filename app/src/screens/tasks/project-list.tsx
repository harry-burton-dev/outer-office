// The shared project: tasks grouped by section, unsectioned first. Tasks move
// up and down within their section; completed ones can be shown on request.
import { useMemo, useState } from "react";
import { useRecords, type RowOf } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/app/ui";
import { useSharedProject, type Project } from "@/app/frame-data";
import { commands } from "@/domain/commands";
import { byOrder, projectTasks, type SectionGroup } from "@/domain/selectors";
import { AddSection } from "./add-section";
import { ErrorLine, ListBody, TaskGroup } from "./list-parts";
import { neighboursAfterMove } from "./neighbours";
import { TaskRow } from "./task-row";
import { useRowActions, type RowActions } from "./use-row-actions";
import { useRun } from "./use-run";

type Task = RowOf<"tasks">;

export const DEFAULT_PROJECT_NAME = "Office work";

/** The project's completed tasks for one group: by section id, or loose ("") for none or unknown. */
export function completedIn(tasks: readonly Task[], group: SectionGroup, projectId: string, knownSections: ReadonlySet<string>): Task[] {
  const key = group.section?.id ?? "";
  return tasks
    .filter((t) => !t._deleted && t.done === true && t.project === projectId)
    .filter((t) => (t.section && knownSections.has(t.section) ? t.section : "") === key)
    .sort(byOrder);
}

interface GroupProps {
  group: SectionGroup;
  completed: readonly Task[];
  actions: RowActions;
  move?: (task: Task, previous?: string, next?: string) => void;
}

function Group({ group, completed, actions, move }: GroupProps) {
  const ids = group.tasks.map((t) => t.id);
  const movesFor = (index: number) => {
    if (!move) return undefined;
    const task = group.tasks[index];
    const up = neighboursAfterMove(ids, index, "up");
    const down = neighboursAfterMove(ids, index, "down");
    return { up: up && (() => move(task, up.previous, up.next)), down: down && (() => move(task, down.previous, down.next)) };
  };
  const rows = [...group.tasks, ...completed];
  if (group.section === undefined && rows.length === 0) return null;
  return (
    <TaskGroup title={group.section ? group.section.name || "Untitled section" : undefined}>
      {rows.map((task, index) => (
        <TaskRow
          key={task.id}
          task={task}
          meta={actions.metaOf(task)}
          onOpen={() => actions.open(task)}
          onToggle={actions.toggle && (() => actions.toggle?.(task))}
          moves={index < group.tasks.length ? movesFor(index) : undefined}
        />
      ))}
    </TaskGroup>
  );
}

function NoProject({ isViewer }: { isViewer: boolean }) {
  const create = useRun(commands.projectSave);
  const action = isViewer ? undefined : <Button variant="outline" onClick={() => create.run({ name: DEFAULT_PROJECT_NAME })}>Create the shared project</Button>;
  return (
    <>
      <PageHeader title="Project" />
      <EmptyState title="No shared project yet" action={action} />
      <ErrorLine error={create.error} />
    </>
  );
}

function ProjectBody({ project }: { project: Project }) {
  const tasks = useRecords("tasks");
  const sections = useRecords("sections");
  const actions = useRowActions();
  const mover = useRun(commands.taskMove);
  const [showCompleted, setShowCompleted] = useState(false);
  const groups = useMemo(() => projectTasks(tasks, sections, project.id), [tasks, sections, project.id]);
  const known = useMemo(() => new Set(groups.flatMap((g) => (g.section ? [g.section.id] : []))), [groups]);
  const isEmpty = groups.every((g) => g.tasks.length === 0) && groups.length === 1;
  const move = actions.isViewer ? undefined : (task: Task, previous?: string, next?: string) => void mover.run({ id: task.id, previous, next });
  const header = (
    <>
      <Button variant="ghost" size="sm" aria-pressed={showCompleted} onClick={() => setShowCompleted(!showCompleted)}>
        {showCompleted ? "Hide completed" : "Show completed"}
      </Button>
      {!actions.isViewer && <AddSection projectId={project.id} />}
    </>
  );
  return (
    <>
      <PageHeader title={project.name || "Project"} actions={header} />
      <ListBody>
        <ErrorLine error={actions.error ?? mover.error} />
        {isEmpty && !showCompleted && <EmptyState title="No tasks in this project yet" />}
        {groups.map((group) => (
          <Group
            key={group.section?.id ?? "loose"}
            group={group}
            completed={showCompleted ? completedIn(tasks, group, project.id, known) : []}
            actions={actions}
            move={move}
          />
        ))}
      </ListBody>
    </>
  );
}

export function ProjectList({ isViewer }: { isViewer: boolean }) {
  const project = useSharedProject();
  return project ? <ProjectBody project={project} /> : <NoProject isViewer={isViewer} />;
}
