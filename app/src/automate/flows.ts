// Every job the app expects a Power Automate flow to do (OUT-91), and how
// healthy each one is for each principal. A flow only reads from Outlook and
// saves the answer as a file; the app does every transform. Pure.
import type { RowOf } from "@trellis/framework";
import { DIARY_INBOX, type InboxEntry } from "./diary-inbox";
import { WINDOW_DAYS_AFTER, WINDOW_DAYS_BEFORE } from "./graph-calendar";
import setUpDiarySync from "./guides/set-up-diary-sync.md?raw";

export interface FlowStep {
  label: string;
  detail: string;
}

export interface FlowDefinition {
  /** flowRuns.flow */
  id: string;
  name: string;
  summary: string;
  /** How often the flow runs, in minutes. */
  everyMinutes: number;
  /** A principal is late when its newest file is older than this. */
  lateAfterMinutes: number;
  steps: readonly FlowStep[];
  /** What the app does with each file. */
  appDoes: readonly string[];
  /** The folder in the shared folder a principal's files land in. */
  folderOf(code: string): string;
  /** The name to give the principal's copy of the flow. */
  flowNameOf(code: string): string;
  /** The step-by-step guide, as Markdown. */
  guide: string;
}

export const DIARY_SYNC_FLOW: FlowDefinition = {
  id: "diary-sync",
  name: "Diary sync",
  summary: "Reads each principal's Outlook calendar every 30 minutes and saves Outlook's answer, untouched, in the shared folder. The app applies it to the diary without a review.",
  everyMinutes: 30,
  lateAfterMinutes: 90,
  steps: [
    { label: "Trigger", detail: "Recurrence, every 30 minutes" },
    { label: "Request", detail: `Office 365 Outlook: Send an HTTP request, one GET to Graph's calendarView, ${WINDOW_DAYS_BEFORE} days back to ${WINDOW_DAYS_AFTER} days ahead, body as plain text` },
    { label: "Save", detail: "Create file: the request's Body, unchanged" },
    { label: "File name", detail: "The run's time in UTC, as yyyyMMddTHHmmssZ.json" },
  ],
  appDoes: [
    "Takes the run's time from the file name, and reads the window from it.",
    "Reads Graph's own fields, works out each recurring meeting's series, and leaves cancelled meetings out.",
    "Reads each meeting's body as plain text, with its links and responses. If the flow's Prefer header is missing, the app turns an HTML body into text itself.",
    "Masks or drops private and confidential meetings, as the office chose. Their real subject never reaches the diary, and they keep no body, links or people.",
    "Applies the changes to the diary and logs them. A run that changes nothing leaves no log entry, but still counts here.",
    "When Outlook sends the diary in pages, the file holds only the first one. The app then updates only the days that page covers, and says so here.",
    "Refuses the whole file, and says why, when it holds an Outlook error, a missing field, or would mark most of the diary gone.",
    "Deletes the file it applied and every older one.",
  ],
  folderOf: (code) => `automate/${DIARY_INBOX}/${code}`,
  flowNameOf: (code) => `Diary sync · ${code}`,
  guide: setUpDiarySync,
};

/** Every flow, in the order the Automate page shows them. */
export const FLOWS: readonly FlowDefinition[] = [DIARY_SYNC_FLOW];

export type FlowState = "off" | "never" | "arrived" | "waiting" | "ok" | "partial" | "late" | "refused";

export interface PrincipalHealth {
  code: string;
  state: FlowState;
  /** When the flow last ran (the newest file's time), or null. */
  lastRunAt: string | null;
  /** When the app last read a file, or null. */
  readAt: string | null;
  /** Why the newest file was not used. */
  reason: string | null;
  /** The last run the app recorded. */
  run: RowOf<"flowRuns"> | null;
}

export interface HealthInput {
  flow: FlowDefinition;
  /** The office's Power Automate setting. */
  on: boolean;
  code: string;
  run: RowOf<"flowRuns"> | undefined;
  /** The newest file in the principal's folder, as this computer read it. */
  entry: InboxEntry | null;
  now: string;
  /** Whether this user applies files (a viewer doesn't). */
  canApply: boolean;
}

const MINUTE_MS = 60_000;
const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

/** One principal's state for one flow. */
export function principalHealth({ flow, on, code, run, entry, now, canApply }: HealthInput): PrincipalHealth {
  const last = run && !run._deleted ? run : null;
  const base = { code, lastRunAt: last?.fileAt || null, readAt: last?.readAt || null, reason: null, run: last };
  if (!on) return { ...base, state: "off" };
  if (entry && !entry.ok) return { ...base, state: "refused", reason: entry.reason };
  if (entry?.ok) {
    const lastRunAt = entry.update.generatedAt;
    // A viewer's computer reads the file but never applies it; the run record says what an applier made of it.
    if (last && last.file === nameOf(entry.update.path) && last.outcome === "refused") return { ...base, lastRunAt, state: "refused", reason: last.reason || null };
    return { ...base, lastRunAt, state: canApply ? "arrived" : "waiting" };
  }
  if (!last) return { ...base, state: "never" };
  if (last.outcome === "refused") return { ...base, state: "refused", reason: last.reason || null };
  const age = last.fileAt ? Date.parse(now) - Date.parse(last.fileAt) : Infinity;
  if (age > flow.lateAfterMinutes * MINUTE_MS) return { ...base, state: "late" };
  return last.reason ? { ...base, state: "partial", reason: last.reason } : { ...base, state: "ok" };
}

/** What each state is called on the page. */
export const STATE_LABEL: Readonly<Record<FlowState, string>> = {
  off: "Off",
  never: "No file yet",
  arrived: "Applying",
  waiting: "Waiting to apply",
  ok: "On time",
  partial: "Part of the diary",
  late: "Late",
  refused: "Can't be used",
};

/** What each state means, in a sentence. */
export const STATE_HELP: Readonly<Record<FlowState, string>> = {
  off: "The office's Power Automate setting is off, so the app reads nothing.",
  never: "The app hasn't seen a file in this principal's folder. Build the flow, or check its folder.",
  arrived: "A new file has arrived and the app is applying it.",
  waiting: "A new file has arrived. Someone who can import applies it when they next open the app.",
  ok: "The last file arrived on time.",
  partial: "The last file arrived on time, but Outlook sent it in pages, so only its first days were updated.",
  late: "No file has arrived for a while. Check the flow's run history in Power Automate.",
  refused: "The newest file can't be used. The reason is shown. The next good file replaces it.",
};
