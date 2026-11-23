// The Import screen's three steps: choose a file, review its diff, done.
import { useCallback, useState } from "react";
import { useCommand, useRecords } from "@trellis/framework";
import { useApp } from "@/app/app-state";
import { useOffice } from "@/app/frame-data";
import { commands } from "@/domain/commands";
import { parseIcs } from "@/import/parse-ics";
import { diffImport } from "@/import/diff";
import type { ImportDiff } from "@/import/types";
import { importWindow, toStored, type PrivatePolicy } from "./import-model";

interface ChooseState {
  step: "choose";
  errors: readonly string[];
  busy: boolean;
}

export type ImportStep =
  | ChooseState
  | { step: "review"; fileName: string; diff: ImportDiff; warnings: readonly string[]; error: string }
  | { step: "done"; fileName: string };

const START: ChooseState = { step: "choose", errors: [], busy: false };

export interface ImportFlow {
  state: ImportStep;
  policy: PrivatePolicy;
  choose(file: File): Promise<void>;
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

  const choose = useCallback(
    async (file: File) => {
      setState({ ...START, busy: true });
      try {
        const parsed = parseIcs(await file.text(), { timeZone: timezone, privatePolicy: policy, ...importWindow(now) });
        if (parsed.events.length === 0 && parsed.warnings.length > 0) return setState({ ...START, errors: parsed.warnings });
        const diff = diffImport(toStored(events, principal), parsed);
        setState({ step: "review", fileName: file.name, diff, warnings: parsed.warnings, error: "" });
      } catch (error: unknown) {
        setState({ ...START, errors: [`The file could not be read: ${messageOf(error)}`] });
      }
    },
    [timezone, policy, now, events, principal],
  );

  const apply = useCallback(() => {
    if (state.step !== "review") return;
    const result = run({ now, principal, file: state.fileName, diff: state.diff });
    setState(result.ok ? { step: "done", fileName: state.fileName } : { ...state, error: result.error });
  }, [state, run, principal, now]);

  const reset = useCallback(() => setState(START), []);
  return { state, policy, choose, apply, reset };
}
