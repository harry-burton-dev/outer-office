import { describe, expect, test } from "vitest";
import type { Event, Overlay } from "@/domain/selectors";
import { LENS_COLOUR, lensFill, type Lens } from "@/domain/lenses";
import { diaryData, latestImport, marksFor, type ImportRow } from "./calendar-data";

const event = (over: Partial<Event> = {}): Event =>
  ({ id: "e1", _deleted: false, principal: "p1", start: "2026-11-24T14:00:00Z", end: "2026-11-24T15:00:00Z", subject: "Meeting", ...over }) as Event;
const overlay = (over: Partial<Overlay> = {}): Overlay => ({ id: "o1", _deleted: false, event: "e1", ...over }) as Overlay;

test("marks come in the order flagged, moved; prep is not marked", () => {
  expect(marksFor(event({ moves: 1 }), overlay({ prep: "needed", flagged: true }))).toEqual(["Flagged", "Moved"]);
  expect(marksFor(event({ moves: 2 }), overlay({ prep: "ready" }))).toEqual(["Moved"]);
  expect(marksFor(event(), undefined)).toEqual([]);
});

test("a masked event has no marks and a removed overlay counts for nothing", () => {
  expect(marksFor(event({ masked: true, moves: 1 }), overlay({ flagged: true }))).toEqual([]);
  expect(marksFor(event(), overlay({ flagged: true, _deleted: true }))).toEqual([]);
});

test("diary data leaves out gone events, other principals and events without times", () => {
  const data = diaryData([event(), event({ id: "e2", gone: true }), event({ id: "e3", principal: "p2" }), event({ id: "e4", start: undefined })], [], "p1");
  expect(data.events.map((e) => e.id)).toEqual(["e1"]);
  expect(data.faces.get("e1")).toEqual({ title: "Meeting", marks: [], tags: [], ownTags: "", ghost: false, proposed: false, archived: false });
});

test("an event is coloured by its primary tag; an Outlook category with a tag's name doesn't add it (B5)", () => {
  const tags = [
    { id: "t1", _deleted: false, _conflicts: {}, name: "Board", colour: "#4ade80", order: 0 },
    { id: "t2", _deleted: false, _conflicts: {}, name: "Urgent", colour: "#f87171", order: 1 },
  ] as Parameters<typeof diaryData>[3];
  const overlays = [{ id: "o1", _deleted: false, _conflicts: {}, event: "e1", tags: "t2,t1" }] as Parameters<typeof diaryData>[1];
  const data = diaryData([event({ categories: "board" }), event({ id: "e2", categories: "Board" })], overlays, "p1", tags);
  expect(data.faces.get("e1")?.tags.map((t) => t.name)).toEqual(["Urgent", "Board"]);
  expect(data.faces.get("e2")?.tags).toEqual([]);
  expect(data.events.map((e) => e.colour)).toEqual(["#f87171", undefined]);
});

test("a lens colours every event in its hue and fills each by its reading; a masked event stays faint", () => {
  const lens = { id: "t", name: "Test", category: "prep", hint: "", read: (e: Event) => ({ strength: e.id === "e1" ? 1 : 0.5, text: `read ${e.id}` }) } as unknown as Lens;
  const data = diaryData([event(), event({ id: "e2" }), event({ id: "e3", masked: true })], [], "p1", [], { lens, now: new Date("2026-11-24T09:00:00Z") });
  expect(data.events.map((e) => e.colour)).toEqual([LENS_COLOUR, LENS_COLOUR, LENS_COLOUR]);
  expect(["e1", "e2", "e3"].map((id) => [data.faces.get(id)?.lensFill, data.faces.get(id)?.lensText])).toEqual([
    [lensFill(1), "read e1"],
    [lensFill(0.5), "read e2"],
    [lensFill(0), undefined],
  ]);
});

test("the latest import is the principal's newest", () => {
  const rows = [
    { id: "i1", _deleted: false, principal: "p1", at: "2026-11-20T09:00:00Z" },
    { id: "i2", _deleted: false, principal: "p1", at: "2026-11-21T09:00:00Z" },
    { id: "i3", _deleted: false, principal: "p2", at: "2026-11-22T09:00:00Z" },
  ] as ImportRow[];
  expect(latestImport(rows, "p1")?.id).toBe("i2");
  expect(latestImport(rows, "p3")).toBeUndefined();
});

describe("clashes, quiet, priority and links on the diary (OUT-84)", () => {
  const at = (time: string) => `2026-11-24T${time}:00Z`;
  const busy = (id: string, start: string, end: string, over: Partial<Event> = {}) => event({ id, subject: id, start: at(start), end: at(end), showAs: "busy", ...over });
  const ov = (eventId: string, over: Partial<Overlay> = {}) => overlay({ id: `o-${eventId}`, event: eventId, ...over });

  test("each side of a clash carries its worst severity and who it clashes with", () => {
    const data = diaryData([busy("a", "09:00", "10:00"), busy("b", "09:30", "10:30"), busy("c", "10:15", "11:00", { showAs: "tentative" })], [], "p1");
    expect(data.faces.get("a")?.clash).toEqual({ severity: "hard", with: ["b"] });
    expect(data.faces.get("b")?.clash).toEqual({ severity: "hard", with: ["a", "c"] });
    expect(data.faces.get("c")?.clash).toEqual({ severity: "soft", with: ["b"] });
  });

  test("an engagement with an open suggestion is marked Suggested, first after its layer mark (D15)", () => {
    const events = [busy("a", "09:00", "10:00"), busy("b", "11:00", "12:00", { masked: true })];
    const data = diaryData(events, [ov("a", { flagged: true })], "p1", [], undefined, { layer: "live", proposals: [], suggested: new Set(["a", "b"]) });
    expect(data.faces.get("a")?.marks).toEqual(["Suggested", "Flagged"]);
    expect(data.faces.get("b")?.marks).toEqual([]);
    expect(diaryData(events, [], "p1").faces.get("a")?.marks).toEqual([]);
  });

  test("a quiet event shows only its Quiet mark: no clash, flag or priority", () => {
    const data = diaryData([busy("a", "09:00", "10:00", { moves: 1 }), busy("b", "09:30", "10:30")], [ov("a", { quiet: true, flagged: true, priority: 1 })], "p1");
    expect(data.faces.get("a")).toMatchObject({ marks: ["Quiet"] });
    expect(data.faces.get("a")?.clash).toBeUndefined();
    expect(data.faces.get("a")?.priority).toBeUndefined();
    expect(data.faces.get("b")?.clash).toBeUndefined();
  });

  test("priority 1 to 3 is shown; 4, none set, and masked events show none", () => {
    const events = [busy("a", "09:00", "10:00"), busy("b", "11:00", "12:00"), busy("c", "13:00", "14:00", { masked: true }), busy("d", "15:00", "16:00")];
    const data = diaryData(events, [ov("a", { priority: 2 }), ov("b", { priority: 4 }), ov("c", { priority: 1 })], "p1");
    expect(["a", "b", "c", "d"].map((id) => data.faces.get(id)?.priority)).toEqual([2, undefined, undefined, undefined]);
  });

  test("a linked child inside its parent is drawn within the parent's block, not as its own", () => {
    const events = [busy("visit", "14:00", "17:00"), busy("speech", "15:00", "15:30"), busy("tour", "14:15", "14:45")];
    const data = diaryData(events, [ov("speech", { parent: "visit" }), ov("tour", { parent: "visit" })], "p1");
    expect(data.events.map((e) => e.id)).toEqual(["visit"]);
    expect(data.faces.get("visit")?.children?.map((c) => c.title)).toEqual(["tour", "speech"]);
    expect(data.faces.get("visit")?.clash).toBeUndefined();
  });

  test("a child a sync moved outside its parent is a block of its own, marked", () => {
    const data = diaryData([busy("visit", "14:00", "16:00"), busy("speech", "16:30", "17:00")], [ov("speech", { parent: "visit" })], "p1");
    expect(data.events.map((e) => e.id)).toEqual(["visit", "speech"]);
    expect(data.faces.get("speech")?.marks).toEqual(["Outside its parent"]);
    expect(data.faces.get("visit")?.children).toBeUndefined();
  });

  test("the graveyard has no clashes", () => {
    const data = diaryData([busy("a", "09:00", "10:00", { gone: true }), busy("b", "09:00", "10:00", { gone: true })], [], "p1", [], undefined, { layer: "graveyard", proposals: [] });
    expect(data.faces.get("a")?.clash).toBeUndefined();
  });
});
