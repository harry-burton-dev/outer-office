// The Import screen's three steps: choose a file (or a diary update from
// Power Automate), review its diff, done.
import { useCallback, useState } from "react";
import { useCommand, useRecords } from "@trellis/framework";
import { useApp } from "@/app/app-state";
import { useOffice } from "@/app/frame-data";
import { commands } from "@/domain/commands";
import { parseIcs, type ParseResult } from "@/import/parse-ics";
import { parseAutomate } from "@/import/parse-automate";
import { useDiaryInbox } from "@/automate/diary-inbox-state";
import type { DiaryUpdate } from "@/automate/diary-inbox";
import { diffImport } from "@/import/diff";
import type { ImportDiff } from "@/import/types";
import { changesAnything, importWindow, toStored, type PrivatePolicy } from "./import-model";

interface ChooseState {
  step: "choose";
  errors: readonly string[];
  busy: boolean;
}

export type ImportStep =
  | ChooseState
  | { step: "review"; fileName: string; diff: ImportDiff; warnings: readonly string[]; error: string; source?: DiaryUpdate }
  | { step: "done"; fileName: string; fromDiary: boolean };

const START: ChooseState = { step: "choose", errors: [], busy: false };

export interface ImportFlow {
  state: ImportStep;
  policy: PrivatePolicy;
  choose(file: File): Promise<void>;
  /** Reviews a diary update from Power Automate instead of a file. */
  chooseDiary(update: DiaryUpdate): void;
  apply(): void;
  reset(): void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function useImportFlow(principal: string): ImportFlow {
  const { now, timezone } = useApp();
  const office = useOffice();
  const events = useRecords("events");
  const run = useCommand(commands.importApply);
  const [state, setState] = useState<ImportStep>(START);
  const policy: PrivatePolicy = office?.privatePolicy === "drop" ? "drop" : "mask";
  const inbox = useDiaryInbox();

  const review = useCallback(
    (parsed: ParseResult, fileName: string, source?: DiaryUpdate) => {
      if (parsed.events.length === 0 && parsed.warnings.length > 0) return setState({ ...START, errors: parsed.warnings });
      const diff = diffImport(toStored(events, principal), parsed);
      setState({ step: "review", fileName, diff, warnings: parsed.warnings, error: "", ...(source ? { source } : {}) });
    },
    [events, principal],
  );

  const choose = useCallback(
    async (file: File) => {
      setState({ ...START, busy: true });
      try {
        review(parseIcs(await file.text(), { timeZone: timezone, privatePolicy: policy, ...importWindow(now) }), file.name);
      } catch (error: unknown) {
        setState({ ...START, errors: [`The file could not be read: ${messageOf(error)}`] });
      }
    },
    [timezone, policy, now, review],
  );

  const chooseDiary = useCallback(
    (update: DiaryUpdate) => review(parseAutomate(update.payload, { timeZone: timezone, privatePolicy: policy }), "Power Automate diary update", update),
    [timezone, policy, review],
  );

  const apply = useCallback(() => {
    if (state.step !== "review") return;
    const result = run({ now, principal, file: state.fileName, diff: state.diff });
    if (!result.ok) return setState({ ...state, error: result.error });
    if (state.source) void inbox.clear(state.source);
    setState({ step: "done", fileName: state.fileName, fromDiary: state.source !== undefined });
  }, [state, run, principal, now, inbox]);

  const reset = useCallback(() => {
    // A diary update with nothing to change is used up: delete it, so it stops showing as ready.
    if (state.step === "review" && state.source && !changesAnything(state.diff)) void inbox.clear(state.source);
    setState(START);
  }, [state, inbox]);
  return { state, policy, choose, chooseDiary, apply, reset };
}
