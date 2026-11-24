// The diary-sync inbox: the flow writes Graph's calendarView response, untouched,
// to automate/inbox/diary-sync/<principal code>/<yyyyMMddTHHmmssZ>.json on each
// run. This finds the newest file in each principal's folder, reads it, and says
// what is ready. Files are never overwritten: the app applies the newest and then
// deletes it and every older one.
import type { PlainFile, PlainFiles } from "@trellis/framework";
import type { DiaryPayload } from "@/import/parse-automate";
import { readGraphCalendar } from "./graph-calendar";

export const AUTOMATE_FOLDER = "automate";
export const DIARY_INBOX = "inbox/diary-sync";

export interface DiaryUpdate {
  /** The principal's code, which is also its folder's name. */
  principal: string;
  /** The newest file, which this update is. */
  path: string;
  /** The folder's other files when it was read: deleted with this one once it is used. */
  olderPaths: readonly string[];
  /** When the flow made it (ISO UTC), from the file's name. */
  generatedAt: string;
  payload: DiaryPayload;
}

export type InboxEntry =
  | { ok: true; update: DiaryUpdate }
  | { ok: false; principal: string; path: string; reason: string };

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
    const checked = readGraphCalendar(read.value, principal, newest.name);
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
