// Test helper (not shipped): a diary-sync file's text, as the flow writes it:
// Graph's calendarView response for a diary payload. Occurrences get their own
// iCalUId, the series UID with the instance date filled in, as Graph's do.
import { MAIN_PAYLOAD } from "@/import/fixtures/diary-payload";
import type { DiaryEvent, DiaryPayload } from "@/import/parse-automate";

const hex = (n: number, width: number): string => n.toString(16).toUpperCase().padStart(width, "0");

/** The series UID with its instance date (year, month, day) set, when it is an Outlook global object id. */
function occurrenceUid(seriesUid: string, originalStart: string): string {
  if (!seriesUid.startsWith("040000008200E00074C5B7101A82E00800000000")) return seriesUid;
  const d = new Date(originalStart);
  return `${seriesUid.slice(0, 32)}${hex(d.getUTCFullYear(), 4)}${hex(d.getUTCMonth() + 1, 2)}${hex(d.getUTCDate(), 2)}${seriesUid.slice(40)}`;
}

function toGraph(e: DiaryEvent, masters: ReadonlyMap<string, string>): object {
  const series = e.seriesMasterId ? masters.get(e.seriesMasterId) : undefined;
  return {
    "@odata.etag": "W/\"etag\"",
    id: `id-${e.iCalUId}-${e.start}`,
    iCalUId: series && e.originalStart ? occurrenceUid(series, e.originalStart) : e.iCalUId,
    type: e.type ?? "singleInstance",
    seriesMasterId: e.seriesMasterId ?? null,
    originalStart: e.originalStart ?? null,
    start: { dateTime: e.start, timeZone: e.timeZone ?? "UTC" },
    end: { dateTime: e.end, timeZone: e.timeZone ?? "UTC" },
    isAllDay: e.isAllDay,
    isCancelled: e.isCancelled ?? false,
    subject: e.subject,
    location: { displayName: e.location ?? "", locationType: "default" },
    organizer: { emailAddress: { name: e.organizer ?? "", address: "" } },
    categories: e.categories ?? [],
    showAs: e.showAs,
    sensitivity: e.sensitivity,
    lastModifiedDateTime: e.lastModifiedDateTime,
    attendees: e.attendees ?? [],
  };
}

/** The raw response for a payload. Its window comes from the file's name, not from here. */
export function graphResponse(payload: DiaryPayload = MAIN_PAYLOAD): { "@odata.context": string; value: object[] } {
  const masters = new Map((payload.masters ?? []).map((m) => [m.id, m.iCalUId] as const));
  return {
    "@odata.context": `https://graph.microsoft.com/v1.0/$metadata#users('${payload.principal}')/calendar/calendarView`,
    value: payload.events.map((e) => toGraph(e, masters)),
  };
}

export const graphFile = (payload: DiaryPayload = MAIN_PAYLOAD): string => JSON.stringify(graphResponse(payload));
