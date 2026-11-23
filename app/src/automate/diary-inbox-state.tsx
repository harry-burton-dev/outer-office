// Reads the diary-sync inbox on every sync tick while the office's Power
// Automate setting is on, applies each update as it arrives (for people who can
// import), and shares what could not be used. Off, it reads nothing.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useCommand, useRecord, useRecords, useSession } from "@trellis/framework";
import { commands, OFFICE_ID } from "@/domain/commands";
import { applyDiaryUpdate } from "./apply-diary";
import { AUTOMATE_FOLDER, clearUpdate, scanDiaryInbox, type DiaryUpdate, type InboxCache, type InboxEntry } from "./diary-inbox";

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
  const tried = useRef(new Set<string>());
  const [refused, setRefused] = useState<ReadonlyMap<string, string>>(new Map());
  const privatePolicy = office?.privatePolicy === "drop" ? "drop" : "mask";
  useEffect(() => {
    if (!canApply) return;
    for (const entry of entries) {
      if (!entry.ok || tried.current.has(entry.update.path)) continue;
      tried.current.add(entry.update.path);
      const outcome = applyDiaryUpdate(entry.update, { principals, events, timeZone, privatePolicy, now, run });
      if (outcome.kind === "refused") setRefused((current) => new Map(current).set(entry.update.path, outcome.reason));
      else void clear(entry.update);
    }
  }, [canApply, entries, principals, events, timeZone, privatePolicy, now, run, clear]);

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
