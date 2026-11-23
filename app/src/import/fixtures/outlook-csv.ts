// Synthetic CSV test data shaped like classic Outlook's Import/Export "Comma
// Separated Values" calendar export: Outlook's full header, every value quoted,
// True/False flags, "Show time as" as a number, CRLF endings, and dates and
// times in the exporting computer's locale. Every name and title is made up.

export const OUTLOOK_CSV_HEADER = [
  "Subject", "Start Date", "Start Time", "End Date", "End Time", "All day event", "Reminder on/off", "Reminder Date",
  "Reminder Time", "Meeting Organizer", "Required Attendees", "Optional Attendees", "Meeting Resources",
  "Billing Information", "Categories", "Description", "Location", "Mileage", "Priority", "Private", "Sensitivity", "Show time as",
] as const;

export interface CsvRow {
  subject: string;
  startDate: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  allDay?: boolean;
  organizer?: string;
  required?: string;
  optional?: string;
  categories?: string;
  description?: string;
  location?: string;
  private?: boolean;
  sensitivity?: "Normal" | "Personal" | "Private" | "Confidential";
  /** 0 free, 1 tentative, 2 busy, 3 out of office, 4 working elsewhere. */
  showAs?: 0 | 1 | 2 | 3 | 4;
}

const quote = (value: string): string => `"${value.replace(/"/g, '""')}"`;
const flag = (value: boolean | undefined): string => (value ? "True" : "False");

export function outlookCsv(rows: readonly CsvRow[]): string {
  const lines = rows.map((r) => [
    r.subject, r.startDate, r.startTime ?? (r.allDay ? "00:00:00" : ""), r.endDate ?? r.startDate, r.endTime ?? (r.allDay ? "00:00:00" : ""),
    flag(r.allDay), "False", "", "", r.organizer ?? "", r.required ?? "", r.optional ?? "", "", "", r.categories ?? "",
    r.description ?? "", r.location ?? "", "", "Normal", flag(r.private), r.sensitivity ?? "Normal", String(r.showAs ?? 2),
  ].map(quote).join(","));
  return [OUTLOOK_CSV_HEADER.map(quote).join(","), ...lines].join("\r\n") + "\r\n";
}

/** A UK-locale week: dd/mm/yyyy, 24-hour times. Includes a day after the 12th so the order can be detected. */
export const UK_ROWS: readonly CsvRow[] = [
  { subject: "Weekly team meeting", startDate: "23/11/2026", startTime: "09:00:00", endTime: "10:00:00", organizer: "Alex Example", required: "Sam Sample;Jo Placeholder", categories: "Internal;Team", location: "Room 1", showAs: 2 },
  { subject: "Visit: Northfield Works", startDate: "24/11/2026", startTime: "14:30:00", endTime: "16:00:00", organizer: "Principal A", location: "Northfield, \"Main\" gate", description: "Line one\r\nline two, with a comma", showAs: 2 },
  { subject: "Conference", startDate: "25/11/2026", endDate: "27/11/2026", allDay: true, categories: "Travel", showAs: 3 },
  { subject: "Doctor", startDate: "26/11/2026", startTime: "08:00:00", endTime: "08:30:00", private: true, sensitivity: "Private", location: "Clinic", showAs: 2 },
  { subject: "Hold for calls", startDate: "27/11/2026", startTime: "12:00:00", endTime: "13:00:00", showAs: 1 },
  { subject: "Lunch", startDate: "05/11/2026", startTime: "12:00:00", endTime: "13:00:00", showAs: 0 },
];

/** The same week from a US-locale computer: mm/dd/yyyy, 12-hour times. */
export const US_ROWS: readonly CsvRow[] = UK_ROWS.map((r) => ({
  ...r,
  startDate: toUs(r.startDate),
  endDate: r.endDate ? toUs(r.endDate) : undefined,
  startTime: r.startTime ? to12h(r.startTime) : undefined,
  endTime: r.endTime ? to12h(r.endTime) : undefined,
}));

function toUs(date: string): string {
  const [d, m, y] = date.split("/");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function to12h(time: string): string {
  const [h = 0, m = 0, s = 0] = time.split(":").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)}:${pad(s)} ${h < 12 ? "AM" : "PM"}`;
}

export const CSV_WINDOW = { timeZone: "Europe/London", windowStart: "2026-05-01T00:00:00.000Z", windowEnd: "2027-11-01T00:00:00.000Z" } as const;
