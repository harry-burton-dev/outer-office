// Reads the diary-sync inbox on every sync tick while the office's Power
// Automate setting is on, applies each update as it arrives (for people who can
// import), and shares what could not be used. Off, it reads nothing.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useCommand, useRecord, useRecords, useSession } from "@trellis/framework";
import { commands, OFFICE_ID } from "@/domain/commands";
import { applyDiaryUpdate } from "./apply-diary";
import { AUTOMATE_FOLDER, clearUpdate, scanDiaryInbox, type DiaryUpdate, type InboxCache, type InboxEntry } from "./diary-inbox";
import { stampOf } from "./graph-calendar";

/** The diary sync's id in flowRuns (OUT-91). */
export const DIARY_SYNC = "diary-sync";
const fileName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

interface DiaryInboxValue {
  entries: readonly InboxEntry[];
  /** Deletes the update's files and stops showing it. */
  clear(update: DiaryUpdate): Promise<void>;
}

const EMPTY: DiaryInboxValue = { entries: [], clear: async () => undefined };
const DiaryInboxContext = createContext<DiaryInboxValue>(EMPTY);

/** What the entries look like, to skip a render when a tick finds nothing new. */
const signature = (entries: readonly InboxEntry[]): string =>
  entries.map((e) => (e.ok ? `${e.update.path}|${e.update.olderPaths.join(",")}` : `${e.path}|${e.reason}`)).join("\n");

export interface DiaryInboxProviderProps {
  /** A viewer never applies updates. */
  canApply: boolean;
  timeZone: string;
  now: string;
  children: ReactNode;
}

export function DiaryInboxProvider({ canApply, timeZone, now, children }: DiaryInboxProviderProps): ReactElement {
  const office = useRecord("office", OFFICE_ID);
  const on = office?._deleted !== true && office?.automate === true;
  const { plainFiles, onTick } = useSession();
  const [entries, setEntries] = useState<readonly InboxEntry[]>([]);
  const last = useRef("");

  useEffect(() => {
    last.current = "";
    setEntries([]);
    if (!on) return undefined;
    const files = plainFiles(AUTOMATE_FOLDER);
    const cache: InboxCache = new Map();
    return onTick(async () => {
      const next = await scanDiaryInbox(files, cache);
      const sig = signature(next);
      if (sig === last.current) return;
      last.current = sig;
      setEntries(next);
    });
  }, [on, plainFiles, onTick]);

  const clear = useCallback(
    async (update: DiaryUpdate) => {
      setEntries((current) => current.filter((e) => !(e.ok && e.update.path === update.path)));
      await clearUpdate(plainFiles(AUTOMATE_FOLDER), update);
    },
    [plainFiles],
  );

  // Each update is tried once. Applied or unchanged, its files are deleted; refused, it stays and says why.
  const principals = useRecords("principals");
  const events = useRecords("events");
  const run = useCommand(commands.importApply);
  const record = useCommand(commands.automateRecordRun);
  const tried = useRef(new Set<string>());
  const [refused, setRefused] = useState<ReadonlyMap<string, string>>(new Map());
  const privatePolicy = office?.privatePolicy === "drop" ? "drop" : "mask";
  useEffect(() => {
    if (!canApply) return;
    for (const entry of entries) {
      const path = entry.ok ? entry.update.path : entry.path;
      if (tried.current.has(path)) continue;
      tried.current.add(path);
      // Every file read is a run for the Automate page (OUT-91), an unchanged one too.
      const file = fileName(path);
      if (!entry.ok) {
        record({ now, flow: DIARY_SYNC, principal: entry.principal, file, fileAt: stampOf(file) ?? "", outcome: "refused", reason: entry.reason });
        continue;
      }
      const outcome = applyDiaryUpdate(entry.update, { principals, events, timeZone, privatePolicy, now, run });
      const base = { now, flow: DIARY_SYNC, principal: entry.update.principal, file, fileAt: entry.update.generatedAt, events: entry.update.payload.events.length };
      if (outcome.kind === "applied") record({ ...base, outcome: "applied", added: outcome.added, changed: outcome.changed, gone: outcome.gone });
      else record(outcome.kind === "refused" ? { ...base, outcome: "refused", reason: outcome.reason } : { ...base, outcome: "unchanged" });
      if (outcome.kind === "refused") setRefused((current) => new Map(current).set(entry.update.path, outcome.reason));
      else void clear(entry.update);
    }
  }, [canApply, entries, principals, events, timeZone, privatePolicy, now, run, record, clear]);

  // What is left to show: updates not yet applied, and why a refused one was not.
  const shown = useMemo(
    () => entries.map((e): InboxEntry => {
      const reason = e.ok ? refused.get(e.update.path) : undefined;
      return e.ok && reason !== undefined ? { ok: false, principal: e.update.principal, path: e.update.path, reason } : e;
    }),
    [entries, refused],
  );
  const value = useMemo(() => ({ entries: shown, clear }), [shown, clear]);
  return <DiaryInboxContext.Provider value={value}>{children}</DiaryInboxContext.Provider>;
}

export const useDiaryInbox = (): DiaryInboxValue => useContext(DiaryInboxContext);

/** The inbox entry for one principal (by record id), or null. */
export function useDiaryEntry(principalId: string | null): InboxEntry | null {
  const principal = useRecord("principals", principalId ?? "");
  const { entries } = useDiaryInbox();
  const code = principal && !principal._deleted ? principal.code : undefined;
  return (code && entries.find((e) => (e.ok ? e.update.principal : e.principal) === code)) || null;
}
