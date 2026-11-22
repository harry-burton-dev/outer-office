// @vitest-environment node
import { describe, expect, test } from "vitest";
import { projectSave, sectionSave } from "./projects";
import { taskAdd } from "./tasks";
import { byId, fails, idOf, NOW, ok, oneDevice, snapshot } from "./testing/world";

describe("project.save", () => {
  test("creates, renames, reorders and archives a project", async () => {
    const a = await oneDevice("user-a");
    const id = ok(a, projectSave, { now: NOW, name: "Shared" });
    expect(byId(a, "projects", id)).toMatchObject({ name: "Shared", owner: "user-a", inbox: false, archived: false, order: 1 });
    ok(a, projectSave, { now: NOW, id, name: "Renamed", order: 3, archived: true });
    expect(byId(a, "projects", id)).toMatchObject({ name: "Renamed", order: 3, archived: true });
  });

  test("refuses to archive an Inbox, an empty name, or a missing project, and writes nothing", async () => {
    const a = await oneDevice("user-a");
    ok(a, taskAdd, { now: NOW, title: "One" });
    const before = snapshot(a);
    expect(fails(a, projectSave, { now: NOW, id: idOf(a, "inbox", "user-a"), archived: true })).toContain("Inbox can't be archived");
    expect(fails(a, projectSave, { now: NOW })).toContain("needs a name");
    expect(fails(a, projectSave, { now: NOW, id: "nope", name: "X" })).toContain("no longer exists");
    expect(snapshot(a)).toBe(before);
  });
});

describe("section.save", () => {
  test("creates sections in order and renames them", async () => {
    const a = await oneDevice();
    const project = ok(a, projectSave, { now: NOW, name: "Shared" });
    const s1 = ok(a, sectionSave, { now: NOW, project, name: "Now" });
    const s2 = ok(a, sectionSave, { now: NOW, project, name: "Later" });
    expect(byId(a, "sections", s2)?.order ?? 0).toBeGreaterThan(byId(a, "sections", s1)?.order ?? 0);
    ok(a, sectionSave, { now: NOW, id: s1, name: "Today", order: 9 });
    expect(byId(a, "sections", s1)).toMatchObject({ project, name: "Today", order: 9 });
  });

  test("refuses a missing project, a move between projects or no name", async () => {
    const a = await oneDevice();
    const project = ok(a, projectSave, { now: NOW, name: "Shared" });
    const other = ok(a, projectSave, { now: NOW, name: "Other" });
    const section = ok(a, sectionSave, { now: NOW, project, name: "Now" });
    expect(fails(a, sectionSave, { now: NOW, project: "nope", name: "X" })).toContain("project no longer exists");
    expect(fails(a, sectionSave, { now: NOW, id: section, project: other })).toContain("can't move");
    expect(fails(a, sectionSave, { now: NOW, project })).toContain("needs a name");
  });
});
