// The hover card's lines (OUT-85, brief 8.1), and that focusing a block from the keyboard opens it.
import { afterEach, expect, test } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { cleanupApp, renderApp } from "@/app/testing/render-app";
import type { Event } from "@/domain/selectors";
import { CalendarScreen } from "../calendar-screen";
import type { EventFace } from "./calendar-data";
import { hoverLines } from "./hover-card";
import { importEvents, MONDAY_NOW, syntheticEvent } from "./testing/events";

afterEach(cleanupApp);

const face = (over: Partial<EventFace> = {}): EventFace => ({ title: "Board meeting", marks: [], tags: [], ownTags: "", ...over });
const ev = (id: string, start: string, over: Partial<Event> = {}): Event =>
  ({ id, _deleted: false, _conflicts: {}, principal: "p1", start, end: new Date(Date.parse(start) + 3_600_000).toISOString(), subject: "Board meeting", location: "Room 4", categories: "Governance", seriesId: "s1", ...over }) as Event;

test("the card lists title, time, place, tags and categories, cards, clash and place in its series", () => {
  const series = ["2026-11-03T10:00:00Z", "2026-11-10T10:00:00Z", "2026-11-17T10:00:00Z", "2026-11-24T10:00:00Z"].map((s, i) => ev(`e${i}`, s));
  const lines = hoverLines(
    face({ tags: [{ id: "t", name: "Board" } as EventFace["tags"][number]], clash: { severity: "hard", with: ["Press call"] } }),
    series[2], [...series, ev("gone", "2026-11-01T10:00:00Z", { gone: true }), ev("other", "2026-11-02T10:00:00Z", { principal: "p2" })],
    [{ id: "c1", shape: "users", complete: true }, { id: "c2", shape: "star", complete: false }], "Europe/London",
  );
  expect(lines).toEqual(["Board meeting", "Tue 17 Nov, 10:00 to 11:00", "Room 4", "Board, Governance", "Cards: 1 of 2 complete", "Clash with Press call", "3 of 4 in its series"]);
});

test("a masked engagement's card shows only its title and time; a single meeting has no series line", () => {
  const masked = ev("m", "2026-11-24T10:00:00Z", { masked: true });
  expect(hoverLines(face({ title: "Private appointment" }), masked, [masked], [], "UTC")).toEqual(["Private appointment", "Tue 24 Nov, 10:00 to 11:00"]);
  const single = ev("s", "2026-11-24T10:00:00Z", { seriesId: "", categories: "", location: "" });
  expect(hoverLines(face(), single, [single], [], "UTC")).toEqual(["Board meeting", "Tue 24 Nov, 10:00 to 11:00"]);
});

test("focusing a block from the keyboard opens its hover card, and leaving closes it", async () => {
  await renderApp({
    now: MONDAY_NOW,
    seed: (s) => importEvents(s, MONDAY_NOW, s.principal("PRINCIPAL-A"), [syntheticEvent("a1", { subject: "Budget review", location: "Room 7" })]),
    children: <CalendarScreen />,
  });
  const block = screen.getByText("Budget review", { exact: true }).closest<HTMLElement>("a, [tabindex]")!;
  act(() => block.focus());
  expect(document.querySelector("[data-hover-card]")?.textContent).toMatch(/Budget review.*Tue 24 Nov, 14:00 to 15:00.*Room 7/);
  act(() => block.blur());
  fireEvent.blur(block);
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
  expect(document.querySelector("[data-hover-card]")).toBeNull();
});
