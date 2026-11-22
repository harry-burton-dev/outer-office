// DiaryCalendar in jsdom: events render, a click reports the id, nothing can be
// dragged, and London times are right on both sides of the October 2026 clock
// change. jsdom has no layout, so positions on the grid are checked in the
// from-disk spike (spike/from-disk-check.js) instead; here the clock-change case
// is checked through the time FullCalendar prints on each event.
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DiaryCalendar, dayIn, shiftTime, type DiaryCalendarProps } from "./diary-calendar";
import { SPIKE_TIME_ZONE, SPIKE_WEEK, SYNTHETIC_EVENTS } from "./spike/synthetic-events";

afterEach(cleanup);

beforeAll(() => {
  // FullCalendar watches its elements' sizes; jsdom has no ResizeObserver.
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function renderDiary(overrides: Partial<DiaryCalendarProps> = {}) {
  const props: DiaryCalendarProps = {
    events: SYNTHETIC_EVENTS,
    view: "week",
    date: SPIKE_WEEK,
    timeZone: SPIKE_TIME_ZONE,
    dayStart: "08:00",
    dayEnd: "18:00",
    onEventClick: vi.fn(),
    onNavigate: vi.fn(),
    onViewChange: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<DiaryCalendar {...props} />) };
}

/** The element holding an event's title, and the event around it. */
const eventBox = (title: string) => screen.getByText(title, { exact: true }).closest<HTMLElement>("[tabindex], a, [role=button]") ?? screen.getByText(title, { exact: true });

test("the week shows Monday to Friday's events and not the weekend's", () => {
  renderDiary();
  for (const title of ["Weekly review", "Budget planning", "Site visit", "Board briefing", "Strategy session", "Travel day", "Quarterly catch-up"]) {
    expect(screen.getByText(title, { exact: true })).toBeTruthy();
  }
  expect(screen.queryByText("Weekend reading")).toBeNull();
});

test("clicking an event calls onEventClick with its id", () => {
  const { props } = renderDiary();
  fireEvent.click(eventBox("Budget planning"));
  expect(props.onEventClick).toHaveBeenCalledWith("e3");
});

test("no event can be dragged", () => {
  const { container } = renderDiary();
  expect(container.querySelectorAll("[draggable=true]")).toHaveLength(0);
  const box = eventBox("Weekly review");
  fireEvent.mouseDown(box, { clientX: 10, clientY: 10 });
  fireEvent.mouseMove(box, { clientX: 10, clientY: 200 });
  fireEvent.mouseUp(box, { clientX: 10, clientY: 200 });
  expect(screen.getByText("Weekly review", { exact: true })).toBeTruthy();
});

test("09:00 London shows as 09:00 on both sides of the clock change", () => {
  // Before: Friday 23 October, BST, 08:00Z. After: Monday 26 October, GMT, 09:00Z.
  const before = renderDiary({ view: "day", date: "2026-10-23" });
  const beforeEvent = eventBox("Morning check-in (BST)");
  expect(within(beforeEvent.parentElement ?? beforeEvent).getByText(/^09:00 – 10:00$/)).toBeTruthy();
  before.unmount();

  renderDiary({ view: "day", date: "2026-10-26" });
  const afterEvent = eventBox("Morning check-in (GMT)");
  expect(within(afterEvent.parentElement ?? afterEvent).getByText(/^09:00 – 10:00$/)).toBeTruthy();
});

test("the grid runs from an hour before the day starts to an hour after it ends", () => {
  expect(shiftTime("08:00", -1)).toBe("07:00:00");
  expect(shiftTime("18:00", 1)).toBe("19:00:00");
  expect(shiftTime("00:30", -1)).toBe("00:00:00");
  expect(shiftTime("23:30", 1)).toBe("24:00:00");
  renderDiary();
  expect(screen.getByText("07:00")).toBeTruthy();
  expect(screen.getByText("18:00")).toBeTruthy();
  expect(screen.queryByText("06:00")).toBeNull();
  expect(screen.queryByText("19:00")).toBeNull();
});

test("dayIn reads the calendar day in the zone, not in UTC", () => {
  expect(dayIn(new Date("2026-10-22T23:30:00Z"), SPIKE_TIME_ZONE)).toBe("2026-10-23");
  expect(dayIn(new Date("2026-10-25T23:30:00Z"), SPIKE_TIME_ZONE)).toBe("2026-10-25");
});

test("next moves the calendar and reports the new week to onNavigate", () => {
  const { props } = renderDiary();
  fireEvent.click(screen.getByRole("button", { name: /next/i }));
  expect(props.onNavigate).toHaveBeenCalledWith("2026-11-02");
});
