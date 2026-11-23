// The diary: a read-only day and week calendar built from FullCalendar's shadcn
// event calendar (forma flavour). It composes the shipped toolbar and views
// itself rather than using <EventCalendar>, because that component always loads
// the interaction, list and multi-month plugins: the diary loads time grid only,
// so nothing can be dragged, resized or created, and the bundle stays smaller.
import { useEffect, useMemo, type ReactNode } from "react";
import { useCalendarController, type DatesSetInfo, type EventClickInfo, type EventDisplayInfo, type EventInput } from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { EventCalendarToolbar } from "@/components/event-calendar-toolbar";
import { EventCalendarViews } from "@/components/ui/event-calendar-views";
import { EventCalendarCloseIcon } from "@/components/event-calendar-icons";

/** One diary entry. `start` and `end` are ISO instants in UTC (ending in Z). */
export interface DiaryEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  /** The event's colour, from its first tag. */
  colour?: string;
}

export type DiaryView = "day" | "week";

export interface DiaryCalendarProps {
  events: readonly DiaryEvent[];
  view: DiaryView;
  /** YYYY-MM-DD: the day, or a day in the week, to show. */
  date: string;
  /** IANA zone the diary is shown in, e.g. "Europe/London". */
  timeZone: string;
  /** "08:00": the grid starts one hour earlier, or earlier still for an earlier event on screen. */
  dayStart: string;
  /** "18:00": the grid ends one hour later, or later still for a later event on screen. */
  dayEnd: string;
  onEventClick: (id: string) => void;
  /** Called with the first visible day when today, previous or next moves the calendar. */
  onNavigate: (date: string) => void;
  onViewChange: (view: DiaryView) => void;
  /** Custom content inside an event; the default is FullCalendar's time and title. */
  /** `time` is FullCalendar's time text for the event, in the office zone. */
  renderEvent?: (event: DiaryEvent, time: string) => ReactNode;
  /** Extra toolbar controls, shown before the day and week tabs. */
  toolbarExtra?: ReactNode;
}

const VIEW_TYPES: Record<DiaryView, string> = { day: "timeGridDay", week: "timeGridWeek" };
const AVAILABLE_VIEWS = [VIEW_TYPES.day, VIEW_TYPES.week];
const PLUGINS = [timeGridPlugin];
const MONDAY = 1;
const SUNDAY = 0;
const SATURDAY = 6;
const WEEKEND = [SUNDAY, SATURDAY];
const DAY_MINUTES = 24 * 60;
const DAY_MS = 86_400_000;
const HOUR_24 = { hour: "2-digit", minute: "2-digit", hour12: false } as const;

/** The Today button's accessible name starts with its visible text ("This Week" alone would not contain "Today"). */
export const todayHint = (unitText: string): string => `Today, back to this ${unitText.toLowerCase()}`;

const viewOf =(type: string): DiaryView | undefined => (type === VIEW_TYPES.day ? "day" : type === VIEW_TYPES.week ? "week" : undefined);

/** "08:00" moved by `hours`, clamped to the day, as FullCalendar's "HH:MM:00". */
export function shiftTime(time: string, hours: number): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const minutes = Math.min(Math.max(h * 60 + m + hours * 60, 0), 24 * 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`;
}

/** The calendar day of an instant in `timeZone`, as YYYY-MM-DD. */
export function dayIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

const addDay = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const weekday = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();
const minuteOfDay = (time: string): number => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
};
/** Minutes after midnight as FullCalendar's "HH:MM:00". */
const clock = (minutes: number): string => shiftTime("00:00", minutes / 60);

/** The local date and minute of the day of an instant in `timeZone`. */
function wallClock(instant: string, timeZone: string): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { date: dayIn(new Date(instant), timeZone), minute: part("hour") * 60 + part("minute") };
}

/** The days a view shows, first and after-last, as YYYY-MM-DD: the date itself, or its Monday-to-Sunday week. */
export function viewRange(view: DiaryView, date: string): { first: string; end: string } {
  if (view === "day") return { first: date, end: addDay(date, 1) };
  const first = addDay(date, -((weekday(date) - MONDAY + 7) % 7));
  return { first, end: addDay(first, 7) };
}

export interface DiaryWindow {
  slotMinTime: string;
  slotMaxTime: string;
  /** Days of the week the week view leaves out: the weekend, unless it is in use. */
  hiddenDays: number[];
}

/**
 * What the grid must show so that no engagement is hidden: the office day with an
 * hour either side, widened to whole hours around any event earlier or later in the
 * days on screen; and the weekend, when the week holds an event on it or the date
 * being looked at is a Saturday or Sunday.
 */
export function diaryWindow(events: readonly DiaryEvent[], view: DiaryView, date: string, timeZone: string, dayStart: string, dayEnd: string): DiaryWindow {
  const { first, end } = viewRange(view, date);
  let min = minuteOfDay(shiftTime(dayStart, -1));
  let max = minuteOfDay(shiftTime(dayEnd, 1));
  let weekend = WEEKEND.includes(weekday(date));
  const usesWeekend = (from: string, until: string) => {
    for (let day = from < first ? first : from; day < until && day < end; day = addDay(day, 1)) if (WEEKEND.includes(weekday(day))) return true;
    return false;
  };
  for (const event of events) {
    if (event.allDay) {
      const from = dayIn(new Date(event.start), timeZone);
      const until = dayIn(new Date(event.end), timeZone);
      if (from < end && until > first) weekend ||= usesWeekend(from, until > from ? until : addDay(from, 1));
      continue;
    }
    const start = wallClock(event.start, timeZone);
    const stop = wallClock(event.end, timeZone);
    // An event ending at midnight belongs to the day before.
    const lastDay = stop.minute === 0 && stop.date > start.date ? addDay(stop.date, -1) : stop.date;
    if (start.date >= end || lastDay < first) continue;
    weekend ||= usesWeekend(start.date, addDay(lastDay, 1));
    // An event over midnight runs to the end of one day and from the start of the next.
    const overnight = lastDay > start.date;
    min = Math.min(min, overnight ? 0 : Math.floor(start.minute / 60) * 60);
    max = Math.max(max, overnight || stop.date > lastDay ? DAY_MINUTES : Math.ceil(stop.minute / 60) * 60);
  }
  return { slotMinTime: clock(min), slotMaxTime: clock(Math.min(max, DAY_MINUTES)), hiddenDays: view === "week" && !weekend ? WEEKEND : [] };
}

/** Timed events keep their UTC instants (FullCalendar shifts them into the zone); all-day events become the zone's calendar days. */
function toInput({ id, title, start, end, allDay, colour }: DiaryEvent, timeZone: string): EventInput {
  const look = colour ? { color: colour, textColor: "var(--foreground)" } : {};
  if (!allDay) return { id, title, start, end, allDay, ...look };
  return { id, title, start: dayIn(new Date(start), timeZone), end: dayIn(new Date(end), timeZone), allDay, ...look };
}

/** True when the YYYY-MM-DD `date` falls in the view's current range, read in `timeZone`. */
function shows(info: { currentStart: Date; currentEnd: Date }, date: string, timeZone: string): boolean {
  const first = dayIn(info.currentStart, timeZone);
  const end = dayIn(info.currentEnd, timeZone);
  return date >= first && date < end;
}

export function DiaryCalendar({ events, view, date, timeZone, dayStart, dayEnd, onEventClick, onNavigate, onViewChange, renderEvent, toolbarExtra }: DiaryCalendarProps) {
  const controller = useCalendarController();
  const byId = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const inputs = useMemo<EventInput[]>(() => events.map((event) => toInput(event, timeZone)), [events, timeZone]);
  const grid = useMemo(() => diaryWindow(events, view, date, timeZone, dayStart, dayEnd), [events, view, date, timeZone, dayStart, dayEnd]);

  // The props lead: move the calendar when the parent's view or date changes.
  useEffect(() => {
    const current = controller.view;
    if (!current) return;
    if (current.type !== VIEW_TYPES[view]) controller.changeView(VIEW_TYPES[view]);
    if (!shows(current, date, timeZone)) controller.gotoDate(date);
  }, [controller, view, date, timeZone]);

  // The toolbar moves the calendar itself; tell the parent so it can follow.
  const datesSet = ({ view: shown }: DatesSetInfo) => {
    const shownView = viewOf(shown.type);
    if (shownView && shownView !== view) onViewChange(shownView);
    if (!shows(shown, date, timeZone)) onNavigate(dayIn(shown.currentStart, timeZone));
  };

  const eventClick = ({ event, jsEvent }: EventClickInfo) => {
    jsEvent.preventDefault();
    onEventClick(event.id);
  };

  const eventContent = renderEvent
    ? ({ event, timeText }: EventDisplayInfo) => {
        const diaryEvent = byId.get(event.id);
        return diaryEvent ? renderEvent(diaryEvent, timeText) : undefined;
      }
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-sm border bg-background shadow-xs" data-diary-calendar="">
      <EventCalendarToolbar className="border-b p-3" controller={controller} availableViews={AVAILABLE_VIEWS}>
        {toolbarExtra}
      </EventCalendarToolbar>
      <div className="min-h-0 grow">
        <EventCalendarViews
          controller={controller}
          plugins={PLUGINS}
          initialView={VIEW_TYPES[view]}
          initialDate={date}
          timeZone={timeZone}
          firstDay={MONDAY}
          views={{ timeGridWeek: { hiddenDays: grid.hiddenDays } }}
          slotMinTime={grid.slotMinTime}
          slotMaxTime={grid.slotMaxTime}
          slotHeaderFormat={HOUR_24}
          eventTimeFormat={HOUR_24}
          todayHint={todayHint}
          height="100%"
          expandRows
          slotDuration="01:00:00"
          editable={false}
          selectable={false}
          events={inputs}
          eventClick={eventClick}
          eventContent={eventContent}
          datesSet={datesSet}
          popoverCloseContent={() => <EventCalendarCloseIcon />}
        />
      </div>
    </div>
  );
}
