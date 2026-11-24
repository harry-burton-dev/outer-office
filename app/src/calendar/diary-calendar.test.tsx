// DiaryCalendar in jsdom: events render, a click reports the id, nothing can be
// dragged unless the diary is given onMove, the keyboard moves an entry, and London times are right on both sides of the October 2026 clock
// change. jsdom has no layout, so positions on the grid are checked in the
// from-disk spike (spike/from-disk-check.js) instead; here the clock-change case
// is checked through the time FullCalendar prints on each event.
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DiaryCalendar, dayIn, diaryWindow, shifted, shiftTime, viewRange, type DiaryCalendarProps, type DiaryEvent } from "./diary-calendar";
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

test("the week shows every event, the weekend's too when it holds one", () => {
  renderDiary();
  for (const title of ["Weekly review", "Budget planning", "Site visit", "Board briefing", "Strategy session", "Travel day", "Quarterly catch-up", "Weekend reading"]) {
    expect(screen.getByText(title, { exact: true })).toBeTruthy();
  }
  expect(screen.getByText(/Sat/)).toBeTruthy();
});

test("a week with nothing at the weekend shows Monday to Friday", () => {
  renderDiary({ events: SYNTHETIC_EVENTS.filter((e) => e.id !== "e11") });
  expect(screen.getByText(/Fri/)).toBeTruthy();
  expect(screen.queryByText(/Sat/)).toBeNull();
  expect(screen.queryByText(/Sun/)).toBeNull();
});

test("an early breakfast and a late dinner widen the grid so both are drawn", () => {
  const events: DiaryEvent[] = [
    { id: "b", title: "Breakfast with a donor", start: "2026-11-24T06:15:00Z", end: "2026-11-24T06:55:00Z", allDay: false },
    { id: "d", title: "Reception and dinner", start: "2026-11-24T19:30:00Z", end: "2026-11-24T22:00:00Z", allDay: false },
  ];
  renderDiary({ events, view: "day", date: "2026-11-24", timeZone: "Europe/London" });
  expect(screen.getByText("Breakfast with a donor", { exact: true })).toBeTruthy();
  expect(screen.getByText("Reception and dinner", { exact: true })).toBeTruthy();
  expect(screen.getByText("06:00")).toBeTruthy();
  expect(screen.getByText("21:00")).toBeTruthy();
});

test("clicking an event calls onEventClick with its id", () => {
  const { props } = renderDiary();
  fireEvent.click(eventBox("Budget planning"));
  expect(props.onEventClick).toHaveBeenCalledWith("e3");
});

test("without onMove no event can be dragged", () => {
  const { container } = renderDiary();
  expect(container.querySelectorAll("[draggable=true]")).toHaveLength(0);
  const box = eventBox("Weekly review");
  fireEvent.mouseDown(box, { clientX: 10, clientY: 10 });
  fireEvent.mouseMove(box, { clientX: 10, clientY: 200 });
  fireEvent.mouseUp(box, { clientX: 10, clientY: 200 });
  expect(screen.getByText("Weekly review", { exact: true })).toBeTruthy();
});

/** The focusable event around an entry's content, as the keyboard reaches it. */
const focusable = (title: string) => {
  const box = screen.getByText(title, { exact: true }).closest<HTMLElement>("[data-entry-id]");
  if (!box) throw new Error(`no entry ${title}`);
  return box.closest<HTMLElement>("[tabindex], a") ?? box;
};
const titled = (event: DiaryEvent) => <span>{event.title}</span>;

test("with onMove, timed events can be dragged and all-day ones can't", () => {
  const { container } = renderDiary({ onMove: vi.fn(), renderEvent: titled });
  const draggable = Array.from(container.querySelectorAll("[data-movable]")).map((el) => el.textContent);
  expect(draggable).toContain("Weekly review");
  expect(draggable).not.toContain("Travel day");
});

test("arrow keys move a focused entry by 15 minutes, a day left or right, and Enter keeps it", () => {
  const onMove = vi.fn();
  renderDiary({ onMove, renderEvent: titled });
  const event = SYNTHETIC_EVENTS.find((e) => e.title === "Weekly review")!;
  const box = focusable("Weekly review");
  fireEvent.keyDown(box, { key: "ArrowDown" });
  fireEvent.keyDown(box, { key: "ArrowDown" });
  fireEvent.keyDown(box, { key: "ArrowRight" });
  expect(screen.getByRole("status").textContent).toMatch(/^Moving Weekly review to .*Enter proposes it, Escape cancels\.$/);
  expect(onMove).not.toHaveBeenCalled();
  fireEvent.keyDown(box, { key: "Enter" });
  expect(onMove).toHaveBeenCalledTimes(1);
  expect(onMove).toHaveBeenCalledWith(event.id, ...Object.values(shifted(event, 30, 1, SPIKE_TIME_ZONE)));
  expect(Date.parse(onMove.mock.calls[0]![1]) - Date.parse(event.start)).toBe(30 * 60_000 + 86_400_000);
});

test("Escape cancels a keyboard move, and an entry canMove refuses doesn't move", () => {
  const onMove = vi.fn();
  renderDiary({ onMove, renderEvent: titled, canMove: (id) => id !== "e3" });
  const box = focusable("Weekly review");
  fireEvent.keyDown(box, { key: "ArrowDown" });
  fireEvent.keyDown(box, { key: "Escape" });
  fireEvent.keyDown(box, { key: "Enter" });
  const refused = focusable("Budget planning");
  fireEvent.keyDown(refused, { key: "ArrowDown" });
  fireEvent.keyDown(refused, { key: "Enter" });
  expect(onMove).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toBe("");
});

test("a move keeps the wall-clock time across the clock change and keeps the length", () => {
  // Friday 23 October 09:00 BST (08:00Z) to Monday 26 October 09:00 GMT (09:00Z).
  expect(shifted({ start: "2026-10-23T08:00:00Z", end: "2026-10-23T09:00:00Z" }, 0, 3, "Europe/London"))
    .toEqual({ start: "2026-10-26T09:00:00.000Z", end: "2026-10-26T10:00:00.000Z" });
  // 23:45 plus 30 minutes is 00:15 the next day.
  expect(shifted({ start: "2026-11-24T23:45:00Z", end: "2026-11-25T00:15:00Z" }, 30, 0, "Europe/London"))
    .toEqual({ start: "2026-11-25T00:15:00.000Z", end: "2026-11-25T00:45:00.000Z" });
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

const at = (id: string, start: string, end: string, allDay = false): DiaryEvent => ({ id, title: id, start, end, allDay });
const LONDON = "Europe/London";

test("viewRange is the day, or its Monday-to-Sunday week", () => {
  expect(viewRange("day", "2026-11-28")).toEqual({ first: "2026-11-28", end: "2026-11-29" });
  expect(viewRange("week", "2026-11-25")).toEqual({ first: "2026-11-23", end: "2026-11-30" });
  expect(viewRange("week", "2026-11-29")).toEqual({ first: "2026-11-23", end: "2026-11-30" });
});

test("diaryWindow keeps the office day when every event fits it", () => {
  expect(diaryWindow([at("a", "2026-11-24T09:00:00Z", "2026-11-24T10:00:00Z")], "week", "2026-11-23", LONDON, "08:00", "18:00"))
    .toEqual({ slotMinTime: "07:00:00", slotMaxTime: "19:00:00", hiddenDays: [0, 6] });
});

test("diaryWindow widens to whole hours around early and late events on screen only", () => {
  const events = [at("b", "2026-11-24T06:15:00Z", "2026-11-24T06:55:00Z"), at("d", "2026-11-24T19:30:00Z", "2026-11-24T22:10:00Z")];
  expect(diaryWindow(events, "day", "2026-11-24", LONDON, "08:00", "18:00")).toMatchObject({ slotMinTime: "06:00:00", slotMaxTime: "23:00:00" });
  expect(diaryWindow(events, "day", "2026-11-25", LONDON, "08:00", "18:00")).toMatchObject({ slotMinTime: "07:00:00", slotMaxTime: "19:00:00" });
  expect(diaryWindow(events, "week", "2026-11-30", LONDON, "08:00", "18:00")).toMatchObject({ slotMinTime: "07:00:00", slotMaxTime: "19:00:00" });
});

test("diaryWindow reads times in the office zone, and an overnight event opens the whole day", () => {
  // 07:30 BST is 06:30Z; the grid must start at 07:00 London, not 06:00.
  expect(diaryWindow([at("x", "2026-10-23T06:30:00Z", "2026-10-23T07:30:00Z")], "day", "2026-10-23", LONDON, "09:00", "17:00")).toMatchObject({ slotMinTime: "07:00:00" });
  expect(diaryWindow([at("n", "2026-11-24T22:00:00Z", "2026-11-25T02:00:00Z")], "week", "2026-11-23", LONDON, "08:00", "18:00")).toMatchObject({ slotMinTime: "00:00:00", slotMaxTime: "24:00:00" });
  // Ending exactly at midnight stays on its own day.
  expect(diaryWindow([at("m", "2026-11-24T21:00:00Z", "2026-11-25T00:00:00Z")], "day", "2026-11-24", LONDON, "08:00", "18:00")).toMatchObject({ slotMinTime: "07:00:00", slotMaxTime: "24:00:00" });
});

test("diaryWindow shows the weekend for a weekend event, a weekend all-day event, or a weekend date", () => {
  const show = (events: DiaryEvent[], date = "2026-11-23") => diaryWindow(events, "week", date, LONDON, "08:00", "18:00").hiddenDays;
  expect(show([at("s", "2026-11-28T10:00:00Z", "2026-11-28T11:00:00Z")])).toEqual([]);
  expect(show([at("s", "2026-11-29T00:00:00Z", "2026-11-30T00:00:00Z", true)])).toEqual([]);
  expect(show([at("f", "2026-11-27T00:00:00Z", "2026-11-28T00:00:00Z", true)])).toEqual([0, 6]);
  expect(show([], "2026-11-28")).toEqual([]);
  expect(show([at("s", "2026-12-05T10:00:00Z", "2026-12-05T11:00:00Z")])).toEqual([0, 6]);
  expect(diaryWindow([], "day", "2026-11-23", LONDON, "08:00", "18:00").hiddenDays).toEqual([]);
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

test("the Today button's accessible name contains its visible text", () => {
  renderDiary();
  const today = screen.getByRole("button", { name: /^today/i });
  expect(today.getAttribute("aria-label")?.toLowerCase()).toContain(today.textContent?.toLowerCase());
});

test.each(["Europe/London", "America/Los_Angeles", "Pacific/Auckland"])("each day header gets its own date in %s", (timeZone) => {
  const seen: string[] = [];
  renderDiary({ view: "week", date: "2026-11-25", timeZone, events: [], renderDayHeader: (date) => { seen.push(date); return <span>{`summary ${date}`}</span>; } });
  expect([...new Set(seen)]).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"]);
  expect(screen.getByText("summary 2026-11-25")).toBeTruthy();
});
