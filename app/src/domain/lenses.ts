// Lenses (OUT-61): insight layers over the diary. A lens reads each event and
// gives a strength from 0 to 1; the diary shows it as how strong the event's
// colour is. A lens can also swap the text an event shows (location). A lens
// never changes data. Lenses sit in tabs by data category.
import type { Event, Overlay } from "./selectors";
import { eventTags, sortedTags, type Tag } from "./tags";

export type LensCategory = "Quality" | "People" | "Time" | "Place";
export const LENS_CATEGORIES: readonly LensCategory[] = ["Quality", "People", "Time", "Place"];

export interface LensReading {
  /** 0 is faint, 1 is full colour. */
  strength: number;
  /** Shown in place of the title, when the lens has something to say instead. */
  text?: string;
}

export interface Lens {
  id: string;
  name: string;
  category: LensCategory;
  /** One line for the menu: what full colour means. */
  hint: string;
  read: (event: Event, overlay: Overlay | undefined, now: Date, tags: readonly Tag[]) => LensReading;
}

const filled = (value: string | undefined): boolean => (value ?? "").trim() !== "";
const DAY_MS = 24 * 60 * 60 * 1000;
const FRESH_DAYS = 30;
const ONLINE = /teams|zoom|webex|google meet|https?:\/\//i;

const completeness: Lens = {
  id: "completeness",
  name: "Completeness",
  category: "Quality",
  hint: "Full colour has a place, organiser, attendees, a category, and no prep still needed.",
  read: (event, overlay) => {
    const checks = [filled(event.location), filled(event.organizer), filled(event.requiredAttendees), filled(event.categories) || filled(overlay?.tags), overlay?.prep !== "needed"];
    return { strength: checks.filter(Boolean).length / checks.length };
  },
};

const seniority: Lens = {
  id: "seniority",
  name: "Seniority",
  category: "People",
  hint: "By the office's tag order: full colour carries the top tag, faint the bottom or none.",
  // Tag order, not Outlook importance: the office controls it, and the sync carries no importance.
  read: (event, overlay, _now, tags) => {
    const order = sortedTags(tags);
    const top = eventTags(event.categories, overlay?.tags, tags).reduce((best, t) => Math.min(best, order.indexOf(t)), order.length);
    if (top === order.length) return { strength: 0.05 };
    return { strength: order.length === 1 ? 1 : 1 - (0.85 * top) / (order.length - 1) };
  },
};

const freshness: Lens = {
  id: "freshness",
  name: "Freshness",
  category: "Time",
  hint: `Full colour changed in Outlook today, fading to nothing after ${FRESH_DAYS} days.`,
  read: (event, _overlay, now) => {
    const changed = Date.parse(event.sourceModified ?? "");
    if (Number.isNaN(changed)) return { strength: 0 };
    const days = Math.max(now.getTime() - changed, 0) / DAY_MS;
    return { strength: Math.max(1 - days / FRESH_DAYS, 0) };
  },
};

const location: Lens = {
  id: "location",
  name: "Location",
  category: "Place",
  hint: "Shows where each meeting is. Full colour is in person, half is online, faint has no place.",
  read: (event) => {
    const where = (event.location ?? "").trim();
    if (where === "") return { strength: 0.1, text: "No location" };
    return { strength: ONLINE.test(where) ? 0.5 : 1, text: where };
  },
};

export const LENSES: readonly Lens[] = [completeness, seniority, freshness, location];

export const lensById = (id: string | null): Lens | undefined => LENSES.find((lens) => lens.id === id);

/** The lens hue: an event's edge, and its fill at full strength. */
export const LENS_COLOUR = "#818cf8";
const FULLEST = 0.9;
/** The fill over an event at `strength`: the lens hue, from clear to nearly solid. */
export const lensFill = (strength: number): string =>
  `rgba(129, 140, 248, ${(FULLEST * Math.min(Math.max(strength, 0), 1)).toFixed(2)})`;
