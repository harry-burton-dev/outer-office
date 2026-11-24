import { describe, expect, test } from "vitest";
import type { ImportDiff } from "../../import/types";
import { fieldsOf, isComplete, optionsOf, progressOf, valuesOf } from "../cards";
import { cardAdd, cardRemove, cardSet, templateRemove, templateSave } from "./cards";
import { importApply } from "./import";
import { principalSave } from "./office";
import { byId, fails, idOf, NOW, ok, oneDevice, rows } from "./testing/world";

const DIFF: ImportDiff = {
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-01T00:00:00Z",
  added: [{ uid: "e1", recurrenceId: "", start: "2026-11-24T14:00:00Z", end: "2026-11-24T15:00:00Z", allDay: false, subject: "Meeting", location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z" }],
  changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0,
};

const DIAL_IN = [
  { id: "system", label: "System", type: "choice" as const, required: true, options: "Teams bridge | 020 7946 0000\nZoom room" },
  { id: "host", label: "Host dials", type: "check" as const },
];

async function setUp() {
  const a = await oneDevice();
  const principal = ok(a, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  ok(a, importApply, { now: NOW, principal, file: "f.ics", diff: DIFF });
  return { a, event: idOf(a, "event", principal, "e1") };
}

describe("templates", () => {
  test("a template keeps its shape and fields, and refuses bad ones", async () => {
    const { a } = await setUp();
    const id = ok(a, templateSave, { now: NOW, name: "Dial-in", shape: "phone", fields: DIAL_IN });
    expect(byId(a, "templates", id)).toMatchObject({ name: "Dial-in", shape: "phone", order: 0 });
    expect(fieldsOf(byId(a, "templates", id)?.fields).map((f) => f.label)).toEqual(["System", "Host dials"]);
    expect(fails(a, templateSave, { now: NOW, name: "dial-in" })).toMatch(/already a template/);
    expect(fails(a, templateSave, { now: NOW, name: "X", shape: "hexagon" })).toMatch(/shapes/);
    expect(fails(a, templateSave, { now: NOW, id, fields: [{ id: "a", label: "", type: "text" }] })).toMatch(/label/);
    expect(fails(a, templateSave, { now: NOW, id, fields: [{ id: "a", label: "Pick", type: "choice" }] })).toMatch(/option/);
    ok(a, templateRemove, { now: NOW, id });
    expect(rows(a, "templates")).toEqual([]);
  });

  test("choice options carry a detail after a bar", () => {
    expect(optionsOf(DIAL_IN[0]!)).toEqual([{ label: "Teams bridge", detail: "020 7946 0000" }, { label: "Zoom room", detail: "" }]);
  });
});

describe("cards", () => {
  test("a card goes on a meeting, fills in field by field, and is complete when its required fields are", async () => {
    const { a, event } = await setUp();
    const template = ok(a, templateSave, { now: NOW, name: "Dial-in", shape: "phone", fields: DIAL_IN });
    const card = ok(a, cardAdd, { now: NOW, event, template });
    const progress = () => progressOf(DIAL_IN, valuesOf(byId(a, "cards", card)?.values));
    expect(progress()).toEqual({ done: 0, total: 1 });
    ok(a, cardSet, { now: NOW, id: card, values: { host: "true" } });
    ok(a, cardSet, { now: NOW, id: card, values: { system: "Teams bridge" } });
    expect(valuesOf(byId(a, "cards", card)?.values)).toEqual({ host: "true", system: "Teams bridge" });
    expect(isComplete(progress())).toBe(true);
    expect(rows(a, "log").filter((l) => l.kind === "card-ready")).toMatchObject([{ event, note: "Dial-in", area: "overlay" }]);
    ok(a, cardSet, { now: NOW, id: card, values: { host: "false" } });
    expect(rows(a, "log").filter((l) => l.kind === "card-ready")).toHaveLength(1);
    ok(a, cardRemove, { now: NOW, id: card });
    expect(rows(a, "cards")).toEqual([]);
  });

  test("with no required fields, every field counts", () => {
    expect(progressOf([{ id: "a", label: "A", type: "text" }, { id: "b", label: "B", type: "check" }], { a: "x" })).toEqual({ done: 1, total: 2 });
  });
});
