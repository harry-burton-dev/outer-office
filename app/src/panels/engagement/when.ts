// "Tue 24 Nov, 14:00–15:00" in the office zone; "Tue 24 Nov, all day" for an all-day event.
import { formatDay, formatTime } from "@/domain/dates";
import type { Event } from "@/domain/selectors";

export function whenText(event: Event, zone: string): string {
  if (!event.start) return "";
  const day = formatDay(event.start, zone);
  if (event.allDay === true) return `${day}, all day`;
  const end = event.end ? `–${formatTime(event.end, zone)}` : "";
  return `${day}, ${formatTime(event.start, zone)}${end}`;
}

/** "Tue 24 Nov 14:00" */
export const instantText = (iso: string, zone: string): string => `${formatDay(iso, zone)} ${formatTime(iso, zone)}`;
