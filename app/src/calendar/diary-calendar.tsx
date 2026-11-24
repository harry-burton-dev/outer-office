// The diary: a day and week calendar built from FullCalendar's shadcn event
// calendar (forma flavour). It composes the shipped toolbar and views itself
// rather than using <EventCalendar>, because that component always loads the
// list and multi-month plugins. The diary loads time grid, and interaction only
// when it is given onMove: then an engagement it allows can be dragged on a
// 15-minute snap, or moved with the arrow keys, and the diary is told where it
// went. Nothing can be resized or created by dragging.
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useCalendarController, type DatesSetInfo, type EventClickInfo, type EventDisplayInfo, type EventDropInfo, type EventInput } from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/react/interaction";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import { dateIn, formatDay, formatTime, instantIn } from "@/domain/dates";
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
  /** Called when an engagement is dropped, or moved with the keyboard and kept, with its new ISO UTC instants. */
  onMove?: (id: string, start: string, end: string) => void;
  /** Whether an entry can be moved; with onMove and no canMove, every timed entry can. All-day entries never can. */
  canMove?: (id: string) => boolean;
  /** Extra content on each day's header, given its date (YYYY-MM-DD in the zone). */
  renderDayHeader?: (date: string) => ReactNode;
}

const VIEW_TYPES: Record<DiaryView, string> = { day: "timeGridDay", week: "timeGridWeek" };
const AVAILABLE_VIEWS = [VIEW_TYPES.day, VIEW_TYPES.week];
const PLUGINS = [timeGridPlugin];
const MOVING_PLUGINS = [timeGridPlugin, interactionPlugin];
/** Drags and arrow keys move in steps of this many minutes. */
export const SNAP_MINUTES = 15;
const SNAP = "00:15:00";
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
function toInput({ id, title, start, end, allDay, colour }: DiaryEvent, timeZone: string, movable: boolean): EventInput {
  const look = colour ? { color: colour, textColor: "var(--foreground)" } : {};
  if (!allDay) return { id, title, start, end, allDay, startEditable: movable, durationEditable: false, ...look };
  return { id, title, start: dayIn(new Date(start), timeZone), end: dayIn(new Date(end), timeZone), allDay, editable: false, ...look };
}

/**
 * Where an entry lands when moved by `minutes` and `days` on the wall clock of
 * `timeZone`, keeping its length. Days are calendar days, so 09:00 stays 09:00
 * across a clock change.
 */
export function shifted(event: Pick<DiaryEvent, "start" | "end">, minutes: number, days: number, timeZone: string): { start: string; end: string } {
  const startMs = Date.parse(event.start);
  const length = Date.parse(event.end) - startMs;
  const minute = minuteOfDay(formatTime(event.start, timeZone)) + minutes;
  const date = addDay(dateIn(event.start, timeZone), days + Math.floor(minute / DAY_MINUTES));
  const wall = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const start = instantIn(date, clock(wall).slice(0, 5), timeZone);
  return { start, end: new Date(Date.parse(start) + length).toISOString() };
}

/** A keyboard move under way: the entry and how far it has gone. */
interface KeyMove {
  id: string;
  minutes: number;
  days: number;
}

const ARROWS: Record<string, { minutes: number; days: number }> = {
  ArrowUp: { minutes: -SNAP_MINUTES, days: 0 },
  ArrowDown: { minutes: SNAP_MINUTES, days: 0 },
  ArrowLeft: { minutes: 0, days: -1 },
  ArrowRight: { minutes: 0, days: 1 },
};

/** The entry id inside a focused event, from the content the diary draws. */
const entryIdIn = (target: EventTarget): string | undefined =>
  target instanceof HTMLElement ? (target.closest("[data-entry-id]") ?? target.querySelector("[data-entry-id]"))?.getAttribute("data-entry-id") ?? undefined : undefined;

/** True when the YYYY-MM-DD `date` falls in the view's current range, read in `timeZone`. */
function shows(info: { currentStart: Date; currentEnd: Date }, date: string, timeZone: string): boolean {
  const first = dayIn(info.currentStart, timeZone);
  const end = dayIn(info.currentEnd, timeZone);
  return date >= first && date < end;
}

export function DiaryCalendar({ events, view, date, timeZone, dayStart, dayEnd, onEventClick, onNavigate, onViewChange, renderEvent, toolbarExtra, onMove, canMove, renderDayHeader }: DiaryCalendarProps) {
  const controller = useCalendarController();
  const byId = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const moves = onMove !== undefined;
  const movable = (event: DiaryEvent) => moves && !event.allDay && (canMove?.(event.id) ?? true);
  const inputs = useMemo<EventInput[]>(
    () => events.map((event) => toInput(event, timeZone, moves && !event.allDay && (canMove?.(event.id) ?? true))),
    [events, timeZone, moves, canMove],
  );
  const [keyMove, setKeyMove] = useState<KeyMove | null>(null);
  const keyTarget = keyMove ? byId.get(keyMove.id) : undefined;
  const keyLanding = keyMove && keyTarget ? shifted(keyTarget, keyMove.minutes, keyMove.days, timeZone) : undefined;
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
        return diaryEvent ? <div className="min-w-0" data-entry-id={diaryEvent.id} data-movable={movable(diaryEvent) ? "" : undefined}>{renderEvent(diaryEvent, timeText)}</div> : undefined;
      }
    : undefined;

  // A drop never moves the entry itself: the diary is told, and draws what it then holds.
  const eventDrop = ({ event, revert }: EventDropInfo) => {
    revert();
    const moved = byId.get(event.id);
    if (!moved || !event.start) return;
    const start = event.start.toISOString();
    const end = new Date(event.start.getTime() + Date.parse(moved.end) - Date.parse(moved.start)).toISOString();
    if (Date.parse(start) !== Date.parse(moved.start)) onMove?.(moved.id, start, end);
  };

  // The keyboard: arrows move a focused entry by the snap step (left and right by a day), Enter keeps it, Escape cancels.
  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onMove) return;
    const entryId = entryIdIn(e.target);
    const entry = entryId ? byId.get(entryId) : undefined;
    if (!entry || !movable(entry)) return;
    const { id } = entry;
    const step = ARROWS[e.key];
    if (step && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (step.days !== 0 && view === "day") return;
      setKeyMove((current) => {
        const from = current?.id === id ? current : { id, minutes: 0, days: 0 };
        return { id, minutes: from.minutes + step.minutes, days: from.days + step.days };
      });
      return;
    }
    if (keyMove?.id !== id) return;
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      setKeyMove(null);
      if (keyLanding && Date.parse(keyLanding.start) !== Date.parse(entry.start)) onMove(id, keyLanding.start, keyLanding.end);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setKeyMove(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-sm border bg-background shadow-xs" data-diary-calendar="" onKeyDownCapture={onKeyDownCapture}>
      <EventCalendarToolbar className="border-b p-3" controller={controller} availableViews={AVAILABLE_VIEWS}>
        {toolbarExtra}
      </EventCalendarToolbar>
      <div className="min-h-0 grow">
        <EventCalendarViews
          controller={controller}
          plugins={onMove ? MOVING_PLUGINS : PLUGINS}
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
          editable={onMove !== undefined}
          eventDurationEditable={false}
          snapDuration={SNAP}
          selectable={false}
          events={inputs}
          eventClick={eventClick}
          eventDrop={eventDrop}
          eventAllow={(span) => !span.allDay}
          eventContent={eventContent}
          datesSet={datesSet}
          popoverCloseContent={() => <EventCalendarCloseIcon />}
          dayHeaderExtra={renderDayHeader ? (day) => renderDayHeader(dayIn(day, timeZone)) : undefined}
        />
      </div>
      <p role="status" aria-live="polite" className={keyLanding ? "border-t px-3 py-2 text-xs" : "sr-only"} data-key-move="">
        {keyLanding && keyTarget
          ? `Moving ${keyTarget.title} to ${formatDay(keyLanding.start, timeZone)}, ${formatTime(keyLanding.start, timeZone)} to ${formatTime(keyLanding.end, timeZone)}. Enter proposes it, Escape cancels.`
          : ""}
      </p>
    </div>
  );
}
