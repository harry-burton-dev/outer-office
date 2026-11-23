// Reads the diary-sync inbox on every sync tick while the office's Power
// Automate setting is on, and shares what is ready. Off, it reads nothing.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useRecord, useSession } from "@trellis/framework";
import { OFFICE_ID } from "@/domain/commands";
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

export function DiaryInboxProvider({ children }: { children: ReactNode }): ReactElement {
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

  const value = useMemo(() => ({ entries, clear }), [entries, clear]);
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
