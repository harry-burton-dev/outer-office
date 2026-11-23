// Pure mapping from stored rows to what the diary shows: one DiaryEvent per
// live, non-gone event, the marks on each, and the latest import line.
import type { RowOf } from "@trellis/framework";
import type { DiaryEvent } from "@/calendar/diary-calendar";
import { addDays, weekdayOf } from "@/domain/dates";
import { eventsForPrincipal, type Event, type Overlay } from "@/domain/selectors";
import { eventTags, type Tag } from "@/domain/tags";
import { LENS_COLOUR, lensFill, type Lens } from "@/domain/lenses";

const SATURDAY = 6;
const SUNDAY = 0;

/** The date the diary opens on: today, or on a Saturday or Sunday the coming Monday, since the week view shows weekdays only. */
export function openingDate(today: string): string {
  const day = weekdayOf(today);
  if (day === SATURDAY) return addDays(today, 2);
  if (day === SUNDAY) return addDays(today, 1);
  return today;
}

export type Mark = "Prep needed" | "Flagged" | "Moved";
export type ImportRow = RowOf<"imports">;

export const MASKED_TITLE = "Private, busy";
export const MAX_MARKS = 2;
export const DEFAULT_DAY_START = "08:00";
export const DEFAULT_DAY_END = "18:00";

/** What one event shows: its title and up to two marks, in priority order. */
export interface EventFace {
  title: string;
  marks: readonly Mark[];
  /** Its tags, first one colours the event. A masked event has none. */
  tags: readonly Tag[];
  /** Its own tag ids and Outlook categories, for the right-click menu. */
  ownTags: string;
  categories: string;
  /** With a lens on: what it says in place of the title, if anything. */
  lensText?: string;
  /** With a lens on: the fill laid over the event, its strength as colour. */
  lensFill?: string;
}

/** Up to two marks, in the order prep needed, flagged, moved. A masked event has none. */
export function marksFor(event: Event, overlay: Overlay | undefined): Mark[] {
  if (event.masked === true) return [];
  const live = overlay && !overlay._deleted ? overlay : undefined;
  const all: Array<Mark | false> = [live?.prep === "needed" && "Prep needed", live?.flagged === true && "Flagged", (event.moves ?? 0) > 0 && "Moved"];
  return all.filter((mark): mark is Mark => mark !== false).slice(0, MAX_MARKS);
}

export const titleOf = (event: Event): string => (event.masked === true ? MASKED_TITLE : event.subject?.trim() || "Untitled");

export interface DiaryData {
  events: DiaryEvent[];
  faces: ReadonlyMap<string, EventFace>;
}

const hasTimes = (event: Event): event is Event & { start: string; end: string } =>
  typeof event.start === "string" && event.start !== "" && typeof event.end === "string" && event.end !== "";

/** With a lens on, it decides each event's colour and may swap its text. */
export interface LensOn {
  lens: Lens;
  now: Date;
}

/** The principal's non-gone events for the diary, and each one's face. */
export function diaryData(events: readonly Event[], overlays: readonly Overlay[], principal: string, tags: readonly Tag[] = [], lensOn?: LensOn): DiaryData {
  const overlayOf = new Map(overlays.filter((o) => !o._deleted).map((o) => [o.event ?? "", o]));
  const shown = eventsForPrincipal(events, principal).filter(hasTimes);
  const faces = new Map(shown.map((e) => {
    const overlay = overlayOf.get(e.id);
    const own = e.masked === true ? [] : eventTags(e.categories, overlay?.tags, tags);
    const face: EventFace = { title: titleOf(e), marks: marksFor(e, overlay), tags: own, ownTags: overlay?.tags ?? "", categories: e.categories ?? "" };
    return [e.id, face];
  }));
  const colours = new Map(shown.map((e) => [e.id, faces.get(e.id)?.tags[0]?.colour]));
  if (lensOn) {
    for (const e of shown) {
      // A masked event tells the lens nothing, so it stays faint.
      const reading = e.masked === true ? { strength: 0 } : lensOn.lens.read(e, overlayOf.get(e.id), lensOn.now);
      colours.set(e.id, LENS_COLOUR);
      const face = faces.get(e.id);
      if (face) faces.set(e.id, { ...face, lensText: reading.text, lensFill: lensFill(reading.strength) });
    }
  }
  return {
    events: shown.map((e) => ({ id: e.id, title: titleOf(e), start: e.start, end: e.end, allDay: e.allDay === true, colour: colours.get(e.id) })),
    faces,
  };
}

/** Whether the principal has any event stored at all, gone or not. */
export const hasAnyEvent = (events: readonly Event[], principal: string): boolean =>
  events.some((e) => !e._deleted && e.principal === principal);

/** The principal's most recent import, or undefined. */
export function latestImport(imports: readonly ImportRow[], principal: string): ImportRow | undefined {
  return imports
    .filter((i) => !i._deleted && i.principal === principal && typeof i.at === "string")
    .reduce<ImportRow | undefined>((latest, i) => (!latest || (i.at ?? "") > (latest.at ?? "") ? i : latest), undefined);
}
