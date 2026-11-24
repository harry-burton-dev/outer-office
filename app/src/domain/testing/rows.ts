// Test helper (not a test file): event and overlay rows for the pure selectors,
// and the synthetic diaries read as stored rows.
import { parseIcs } from "../../import/parse-ics";
import { PLANTED_PRINCIPAL, syntheticDiaries } from "../../import/testing/synthetic-diaries";
import type { Event, Overlay } from "../selectors";

export const ZONE = "Europe/London";

export const ev = (id: string, start: string, end: string, fields: Partial<Event> = {}): Event =>
  ({ id, _deleted: false, _conflicts: {}, principal: "p", start, end, allDay: false, showAs: "busy", gone: false, subject: id, ...fields }) as Event;

export const ov = (event: string, fields: Partial<Overlay> = {}): Overlay =>
  ({ id: `o-${event}`, _deleted: false, _conflicts: {}, event, quiet: false, parent: "", priority: 4, archived: "", ...fields }) as Overlay;

/** The planted principal's base diary, as stored rows with the subject as id. */
export function plantedDiary(now: Date): Event[] {
  const file = syntheticDiaries(now).find((f) => f.fileName === `${PLANTED_PRINCIPAL}.ics`);
  const parsed = parseIcs(file?.text ?? "", { timeZone: ZONE, windowStart: "2026-01-01T00:00:00Z", windowEnd: "2028-01-01T00:00:00Z", privatePolicy: "mask" });
  return parsed.events.map((e, i) => ev(`${e.subject}#${i}`, e.start, e.end, { ...e, principal: PLANTED_PRINCIPAL, gone: false }));
}
