// The diary-sync inbox: flow F2 writes one event file per principal per run to
// automate/inbox/diary-sync/<principal code>/<yyyyMMddTHHmmssZ>.json. This finds
// the newest file in each principal's folder, checks it, and says what is ready.
// Files are never overwritten (spec v3, F6): the app applies the newest and then
// deletes it and every older one. The flow deletes anything older than 48 hours.
import type { PlainFile, PlainFiles } from "@trellis/framework";
import type { DiaryPayload } from "@/import/parse-automate";
import config from "../../app.config";

export const AUTOMATE_FOLDER = "automate";
/** "outer-office/automate". Built from the app's id, as the build supplies it, so the app's name is never written into its code. */
export const PROTOCOL = `${config.id}/automate`;
export const DIARY_INBOX = "inbox/diary-sync";

export interface DiaryUpdate {
  /** The principal's code, which is also its folder's name. */
  principal: string;
  /** The newest file, which this update is. */
  path: string;
  /** The folder's other files when it was read: deleted with this one once it is used. */
  olderPaths: readonly string[];
  /** When the flow made it (ISO UTC). */
  generatedAt: string;
  payload: DiaryPayload;
}

export type InboxEntry =
  | { ok: true; update: DiaryUpdate }
  | { ok: false; principal: string; path: string; reason: string };

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string";
const isTextOrNull = (value: unknown): boolean => value === null || value === undefined || typeof value === "string";
const SENSITIVITIES = new Set(["normal", "personal", "private", "confidential"]);

/** Why one event can't be read, or "" when it can. Only what parseAutomate relies on; the flow is checked against the full schema. */
function eventProblem(event: unknown): string {
  if (!isObject(event)) return "an event is not an object";
  for (const key of ["iCalUId", "start", "end", "subject", "showAs", "lastModifiedDateTime"]) {
    if (!isText(event[key])) return `an event's ${key} is not text`;
  }
  if (typeof event.isAllDay !== "boolean") return "an event's isAllDay is not true or false";
  if (!isText(event.sensitivity) || !SENSITIVITIES.has(event.sensitivity)) return "an event's sensitivity is not one of normal, personal, private or confidential";
  for (const key of ["seriesMasterId", "originalStart", "timeZone", "location", "organizer"]) {
    if (!isTextOrNull(event[key])) return `an event's ${key} is not text`;
  }
  const categories = event.categories;
  if (!(categories === null || categories === undefined || isText(categories) || (Array.isArray(categories) && categories.every(isText)))) {
    return "an event's categories are not a list of text";
  }
  return "";
}

function payloadProblem(data: unknown, principal: string): string {
  if (!isObject(data)) return "it has no diary data";
  if (data.principal !== principal) return `it is for ${String(data.principal)}, but is in ${principal}'s folder`;
  if (!isText(data.windowStart) || !isText(data.windowEnd)) return "its window is missing";
  if (typeof data.count !== "number") return "its count is missing";
  if (!Array.isArray(data.events)) return "it has no list of events";
  const masters = data.masters ?? [];
  if (!Array.isArray(masters) || !masters.every((m) => isObject(m) && isText(m.id) && isText(m.iCalUId))) return "its masters list is not valid";
  for (const event of data.events) {
    const problem = eventProblem(event);
    if (problem) return problem;
  }
  return "";
}

/** The file's diary payload, or why it can't be used. */
export function checkDiaryEvent(value: unknown, principal: string): { ok: true; generatedAt: string; payload: DiaryPayload } | { ok: false; reason: string } {
  if (!isObject(value) || value.protocol !== PROTOCOL || value.kind !== "event") return { ok: false, reason: "it is not an Outer Office automate event" };
  if (value.version !== 1) return { ok: false, reason: `it uses protocol version ${String(value.version)}, and this app reads version 1` };
  if (value.process !== "diary-sync") return { ok: false, reason: `it is from the process "${String(value.process)}", not diary-sync` };
  if (value.processVersion !== 1) return { ok: false, reason: `it was made by diary-sync version ${String(value.processVersion)}, and this app reads version 1` };
  if (!isText(value.generatedAt) || Number.isNaN(Date.parse(value.generatedAt))) return { ok: false, reason: "it has no valid generatedAt" };
  const problem = payloadProblem(value.data, principal);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, generatedAt: value.generatedAt, payload: value.data as unknown as DiaryPayload };
}

/** What was read from a file, kept while its size and modified time are unchanged, so a big file is read once. */
export type InboxCache = Map<string, { size: number; lastModified: number; entry: InboxEntry }>;

const isJson = (file: PlainFile): boolean => file.name.toLowerCase().endsWith(".json");

/** The newest file of one principal's folder, or null when there is none or it is still arriving. */
async function readFolder(files: PlainFiles, principal: string, cache: InboxCache): Promise<InboxEntry | null> {
  // Names are yyyyMMddTHHmmssZ.json, so the last by name is the newest. A conflict copy sorts beside its original.
  const listed = (await files.list(`${DIARY_INBOX}/${principal}`)).filter(isJson);
  const newest = listed[listed.length - 1];
  if (!newest) return null;
  const olderPaths = listed.slice(0, -1).map((f) => f.path);
  const cached = cache.get(newest.path);
  const reuse = cached && cached.size === newest.size && cached.lastModified === newest.lastModified;
  let entry = reuse ? cached.entry : null;
  if (!entry) {
    const read = await files.readJson(newest.path);
    if (!read.ok) {
      // Still arriving, gone, or not readable just now: try again on the next tick.
      return null;
    }
    const checked = checkDiaryEvent(read.value, principal);
    entry = checked.ok
      ? { ok: true, update: { principal, path: newest.path, olderPaths, generatedAt: checked.generatedAt, payload: checked.payload } }
      : { ok: false, principal, path: newest.path, reason: checked.reason };
    cache.set(newest.path, { size: newest.size, lastModified: newest.lastModified, entry });
  }
  return entry.ok ? { ok: true, update: { ...entry.update, olderPaths } } : entry;
}

/** One entry per principal folder that holds a diary file, sorted by principal. */
export async function scanDiaryInbox(files: PlainFiles, cache: InboxCache): Promise<InboxEntry[]> {
  const entries: InboxEntry[] = [];
  for (const principal of await files.listDirs(DIARY_INBOX)) {
    const entry = await readFolder(files, principal, cache);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Deletes an update's file and the older ones it replaced. A file already gone is fine. */
export async function clearUpdate(files: PlainFiles, update: DiaryUpdate): Promise<void> {
  for (const path of [update.path, ...update.olderPaths]) await files.delete(path);
}
