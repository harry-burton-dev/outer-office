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
}

export type DiaryView = "day" | "week";

export interface DiaryCalendarProps {
  events: readonly DiaryEvent[];
  view: DiaryView;
  /** YYYY-MM-DD: the day, or a day in the week, to show. */
  date: string;
  /** IANA zone the diary is shown in, e.g. "Europe/London". */
  timeZone: string;
  /** "08:00": the grid starts one hour earlier. */
  dayStart: string;
  /** "18:00": the grid ends one hour later. */
  dayEnd: string;
  onEventClick: (id: string) => void;
  /** Called with the first visible day when today, previous or next moves the calendar. */
  onNavigate: (date: string) => void;
  onViewChange: (view: DiaryView) => void;
  /** Custom content inside an event; the default is FullCalendar's time and title. */
  renderEvent?: (event: DiaryEvent) => ReactNode;
}

const VIEW_TYPES: Record<DiaryView, string> = { day: "timeGridDay", week: "timeGridWeek" };
const AVAILABLE_VIEWS = [VIEW_TYPES.day, VIEW_TYPES.week];
const PLUGINS = [timeGridPlugin];
const MONDAY = 1;
const WEEKEND = [0, 6];
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

/** Timed events keep their UTC instants (FullCalendar shifts them into the zone); all-day events become the zone's calendar days. */
function toInput({ id, title, start, end, allDay }: DiaryEvent, timeZone: string): EventInput {
  if (!allDay) return { id, title, start, end, allDay };
  return { id, title, start: dayIn(new Date(start), timeZone), end: dayIn(new Date(end), timeZone), allDay };
}

/** True when the YYYY-MM-DD `date` falls in the view's current range, read in `timeZone`. */
function shows(info: { currentStart: Date; currentEnd: Date }, date: string, timeZone: string): boolean {
  const first = dayIn(info.currentStart, timeZone);
  const end = dayIn(info.currentEnd, timeZone);
  return date >= first && date < end;
}

export function DiaryCalendar({ events, view, date, timeZone, dayStart, dayEnd, onEventClick, onNavigate, onViewChange, renderEvent }: DiaryCalendarProps) {
  const controller = useCalendarController();
  const byId = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const inputs = useMemo<EventInput[]>(() => events.map((event) => toInput(event, timeZone)), [events, timeZone]);

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
    ? ({ event }: EventDisplayInfo) => {
        const diaryEvent = byId.get(event.id);
        return diaryEvent ? renderEvent(diaryEvent) : undefined;
      }
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-sm border bg-background shadow-xs" data-diary-calendar="">
      <EventCalendarToolbar className="border-b p-3" controller={controller} availableViews={AVAILABLE_VIEWS} />
      <div className="min-h-0 grow">
        <EventCalendarViews
          controller={controller}
          plugins={PLUGINS}
          initialView={VIEW_TYPES[view]}
          initialDate={date}
          timeZone={timeZone}
          firstDay={MONDAY}
          views={{ timeGridWeek: { hiddenDays: WEEKEND } }}
          slotMinTime={shiftTime(dayStart, -1)}
          slotMaxTime={shiftTime(dayEnd, 1)}
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
