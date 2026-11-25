// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  binTasks, eventsForPrincipal, hasAckedPrivacy, inboxTasks, isViewer, projectTasks, todayTasks,
  type Event, type Overlay, type Person, type Section, type Task,
} from "./selectors";

const meta = (id: string) => ({ id, _deleted: false, _conflicts: {} });
const task = (id: string, over: Partial<Task> = {}): Task => ({ ...meta(id), title: id, done: false, createdBy: "user-a", ...over }) as Task;
const ev = (id: string, over: Partial<Event> = {}): Event => ({ ...meta(id), principal: "p-a", start: "2026-11-22T12:00:00Z", gone: false, ...over }) as Event;
const overlay = (event: string, over: Partial<Overlay> = {}): Overlay => ({ ...meta(`o-${event}`), event, prep: "none", flagged: false, ...over }) as Overlay;
const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id);

const NOW = "2026-11-22T09:00:00Z";
const TODAY = "2026-11-22";
const base = { principal: "p-a", tasks: [], events: [], overlays: [], now: NOW, timezone: "Europe/London" };

describe("todayTasks", () => {
  test("lists the user's open tasks that are overdue or due today, overdue first", () => {
    const tasks = [
      task("today", { due: TODAY }),
      task("late", { due: "2026-11-01" }),
      task("assigned-to-me", { assignee: "user-a", createdBy: "user-b", assignment: "accepted", due: TODAY }),
      task("assigned-away", { assignee: "user-b", assignment: "offered", due: TODAY }),
      task("someone-elses", { createdBy: "user-b", due: TODAY }),
      task("declined-by-me", { assignee: "user-a", createdBy: "user-b", assignment: "declined", due: TODAY }),
      task("done", { due: TODAY, done: true }),
      task("future", { due: "2026-12-01" }),
      task("no-date"),
    ];
    const result = ids(todayTasks(tasks, "user-a", TODAY));
    expect(result[0]).toBe("late");
    expect(result.slice(1).sort()).toEqual(["assigned-to-me", "today"]);
  });
});

describe("inboxTasks and binTasks", () => {
  test("inboxTasks gives open tasks in the Inbox by order, ties by id", () => {
    const tasks = [task("b", { project: "inbox", order: 2 }), task("a", { project: "inbox", order: 1 }), task("c", { project: "inbox", order: 1 }),
      task("done", { project: "inbox", done: true }), task("elsewhere", { project: "p" })];
    expect(ids(inboxTasks(tasks, "inbox"))).toEqual(["a", "c", "b"]);
  });

  test("binTasks gives only removed tasks, newest first", () => {
    const tasks = [task("old", { _deleted: true, createdAt: "2026-11-01T00:00:00Z" }), task("new", { _deleted: true, createdAt: "2026-11-20T00:00:00Z" }), task("live")];
    expect(ids(binTasks(tasks))).toEqual(["new", "old"]);
  });
});

describe("projectTasks", () => {
  test("groups open tasks by section in order, unsectioned first, missing sections treated as none", () => {
    const sections = [
      { ...meta("s2"), project: "p", name: "Later", order: 2 }, { ...meta("s1"), project: "p", name: "Now", order: 1 },
      { ...meta("other"), project: "q", name: "Other", order: 0 },
    ] as Section[];
    const tasks = [
      task("loose", { project: "p", order: 1 }), task("orphan", { project: "p", section: "not-arrived", order: 2 }),
      task("in-s1", { project: "p", section: "s1" }), task("in-s2", { project: "p", section: "s2" }),
      task("done", { project: "p", section: "s1", done: true }),
    ];
    const groups = projectTasks(tasks, sections, "p");
    expect(groups.map((g) => [g.section?.id, ids(g.tasks)])).toEqual([[undefined, ["loose", "orphan"]], ["s1", ["in-s1"]], ["s2", ["in-s2"]]]);
  });
});

describe("eventsForPrincipal", () => {
  test("gives the principal's events that are not gone, by start", () => {
    const events = [ev("b", { start: "2026-11-23T10:00:00Z" }), ev("a", { start: "2026-11-22T10:00:00Z" }), ev("gone", { gone: true }), ev("other", { principal: "p-b" })];
    expect(ids(eventsForPrincipal(events, "p-a"))).toEqual(["a", "b"]);
  });
});

describe("isViewer and hasAckedPrivacy", () => {
  const people = [
    { ...meta("person:user-a"), userId: "user-a", mode: "viewer", privacyAckAt: "2026-11-22T09:00:00Z" },
    { ...meta("person:user-b"), userId: "user-b", mode: "assistant" },
  ] as Person[];

  test("reads the user's mode", () => {
    expect(isViewer(people, "user-a")).toBe(true);
    expect(isViewer(people, "user-b")).toBe(false);
    expect(isViewer(people, "user-c")).toBe(false);
  });

  test("reads whether the user acknowledged the notice", () => {
    expect(hasAckedPrivacy(people, "user-a")).toBe(true);
    expect(hasAckedPrivacy(people, "user-b")).toBe(false);
    expect(hasAckedPrivacy([], "user-a")).toBe(false);
  });
});
