// Pure mapping from stored rows to what the diary shows: one DiaryEvent per
// live, non-gone event, the marks on each, and the latest import line.
import type { RowOf } from "@trellis/framework";
import type { DiaryEvent } from "@/calendar/diary-calendar";
import { eventsForPrincipal, type Event, type Overlay } from "@/domain/selectors";
import { eventTags, type Tag } from "@/domain/tags";
import { LENS_COLOUR, lensFill, type Lens } from "@/domain/lenses";

export type Mark = "Move proposed" | "Proposed" | "New" | "Gone from Outlook" | "Archived" | "Flagged" | "Moved";
export type Proposal = RowOf<"proposals">;

/** The diary's layers, top to bottom: proposed changes, the live diary, and the graveyard of events gone from Outlook. */
export const LAYERS = ["proposed", "live", "graveyard"] as const;
export type Layer = (typeof LAYERS)[number];
export const LAYER_NAMES: Record<Layer, string> = { proposed: "Proposed", live: "Live diary", graveyard: "Graveyard" };

/** A ghost's id: the event's id, marked so it can't clash with a real one. */
const GHOST = "::was";
export const ghostId = (eventId: string): string => `${eventId}${GHOST}`;
/** A proposed new meeting's diary id. */
const NEW = "proposal::";
export const newId = (proposalId: string): string => `${NEW}${proposalId}`;
/** The proposal behind a diary entry for a proposed new meeting, or undefined. */
export const proposalIdOf = (entryId: string): string | undefined => (entryId.startsWith(NEW) ? entryId.slice(NEW.length) : undefined);
/** The event behind a diary entry, ghost or not. */
export const eventIdOf = (entryId: string): string => (entryId.endsWith(GHOST) ? entryId.slice(0, -GHOST.length) : entryId);
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
  /** A ghost: where the event is now, left behind by a proposed move. */
  ghost?: boolean;
  /** Whether the event has a proposal, for the right-click menu. */
  proposed?: boolean;
  /** Archived by the office: in the graveyard, and can be brought back. */
  archived?: boolean;
  /** On the Proposed layer: how much the live diary behind is veiled, 0 to 1. */
  veil?: number;
}

/** Up to two marks, in the order flagged, moved. A masked event has none. Prep is no longer marked: cards replace it (OUT-62). */
export function marksFor(event: Event, overlay: Overlay | undefined): Mark[] {
  if (event.masked === true) return [];
  const live = overlay && !overlay._deleted ? overlay : undefined;
  const all: Array<Mark | false> = [live?.flagged === true && "Flagged", (event.moves ?? 0) > 0 && "Moved"];
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

/** Which layer the diary shows, and the proposals the upper layer is made of. */
export interface LayerOn {
  layer: Layer;
  proposals: readonly Proposal[];
  /** On the Proposed layer: how strongly the unchanged live diary shows, 0 to 1 (default 1). */
  liveAlpha?: number;
}

const isArchived = (overlay: Overlay | undefined): boolean => Boolean(overlay?.archived);

/** The principal's events gone from Outlook (deleted or cancelled there) or archived by the office, by start. */
const graveyardOf = (events: readonly Event[], principal: string, overlayOf: ReadonlyMap<string, Overlay>): Event[] =>
  events
    .filter((e) => !e._deleted && e.principal === principal && (e.gone === true || isArchived(overlayOf.get(e.id))))
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));

/** A proposed new meeting as a diary event row, so it is drawn like the rest. */
const asEvent = (p: Proposal): Event => ({
  id: newId(p.id), _deleted: false, _conflicts: {}, principal: p.principal, start: p.start, end: p.end, allDay: p.allDay,
  subject: p.subject, location: p.location, categories: p.categories, importance: p.importance, sensitivity: p.sensitivity,
  requiredAttendees: p.requiredAttendees, optionalAttendees: p.optionalAttendees,
}) as Event;

/**
 * The diary on one layer, and each entry's face. Live: the principal's events, with any
 * that have a proposal ghosted where they are. Proposed: those events at their proposed
 * times, each with a ghost where it is now. Graveyard: the events gone from Outlook.
 */
export function diaryData(events: readonly Event[], overlays: readonly Overlay[], principal: string, tags: readonly Tag[] = [], lensOn?: LensOn, layerOn: LayerOn = { layer: "live", proposals: [] }): DiaryData {
  const overlayOf = new Map(overlays.filter((o) => !o._deleted).map((o) => [o.event ?? "", o]));
  const live = layerOn.proposals.filter((p) => !p._deleted && p.start && p.end);
  const proposalOf = new Map(live.filter((p) => p.kind !== "new" && p.event).map((p) => [p.event ?? "", p]));
  const newOnes = live.filter((p) => p.kind === "new" && p.principal === principal).map(asEvent);
  const { layer } = layerOn;
  const veil = layer === "proposed" ? 1 - Math.min(Math.max(layerOn.liveAlpha ?? 1, 0), 1) : 0;
  const base = layer === "graveyard"
    ? graveyardOf(events, principal, overlayOf)
    : eventsForPrincipal(events, principal).filter((e) => !isArchived(overlayOf.get(e.id)));
  const real = [...base, ...(layer === "proposed" ? newOnes : [])].filter(hasTimes).map((e) => {
    const proposal = layer === "proposed" ? proposalOf.get(e.id) : undefined;
    return proposal ? { ...e, start: proposal.start ?? e.start, end: proposal.end ?? e.end } : e;
  });
  // On the Proposed layer, a ghost stays where each proposed event is now.
  const ghosts = layer === "proposed" ? base.filter(hasTimes).filter((e) => proposalOf.has(e.id)).map((e) => ({ ...e, id: ghostId(e.id) })) : [];
  const shown = [...real, ...ghosts];
  const faces = new Map(shown.map((e) => {
    const id = eventIdOf(e.id);
    const overlay = overlayOf.get(id);
    const own = e.masked === true ? [] : eventTags(e.categories, overlay?.tags, tags);
    const isNew = proposalIdOf(e.id) !== undefined;
    const proposed = isNew || proposalOf.has(id);
    const ghost = e.id !== id || (layer === "live" && proposed);
    const archived = isArchived(overlay);
    const lead: Mark[] = layer === "graveyard" ? [archived ? "Archived" : "Gone from Outlook"] : isNew ? ["New"] : !proposed ? [] : ghost ? ["Move proposed"] : ["Proposed"];
    const marks = [...lead, ...marksFor(e, overlay)].slice(0, MAX_MARKS);
    const face: EventFace = { title: titleOf(e), marks, tags: own, ownTags: overlay?.tags ?? "", categories: e.categories ?? "", ghost, proposed, archived };
    // The slider veils the live diary behind the proposals, not the proposals themselves.
    if (veil > 0 && !proposed) face.veil = veil;
    return [e.id, face];
  }));
  const colours = new Map(shown.map((e) => [e.id, faces.get(e.id)?.tags[0]?.colour]));
  if (lensOn) {
    for (const e of shown) {
      // A masked event tells the lens nothing, so it stays faint.
      const reading = e.masked === true ? { strength: 0 } : lensOn.lens.read(e, overlayOf.get(eventIdOf(e.id)), lensOn.now, tags);
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
