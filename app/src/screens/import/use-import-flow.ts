// The Import screen's steps: choose a file (.ics, or Outlook's CSV as a
// fallback), say the CSV's date order if it can't be told, review the diff, done.
import { useCallback, useState } from "react";
import { useCommand, useRecords } from "@trellis/framework";
import { useApp } from "@/app/app-state";
import { useOffice } from "@/app/frame-data";
import { commands } from "@/domain/commands";
import { parseIcs, type ParseResult } from "@/import/parse-ics";
import { detectDateOrder, joinCsvToStored, parseCsv, type DateOrder } from "@/import/parse-csv";
import { diffImport } from "@/import/diff";
import type { ImportDiff } from "@/import/types";
import { importWindow, toStored, type PrivatePolicy } from "./import-model";

interface ChooseState {
  step: "choose";
  errors: readonly string[];
  busy: boolean;
}

export type ImportSource = "ics" | "csv";

export type ImportStep =
  | ChooseState
  | { step: "order"; fileName: string; text: string }
  | { step: "review"; source: ImportSource; fileName: string; diff: ImportDiff; warnings: readonly string[]; error: string }
  | { step: "done"; fileName: string };

const START: ChooseState = { step: "choose", errors: [], busy: false };

export interface ImportFlow {
  state: ImportStep;
  policy: PrivatePolicy;
  choose(file: File): Promise<void>;
  chooseCsv(file: File): Promise<void>;
  /** For a CSV whose dates read both ways: which order the exporting computer used. */
  pickOrder(order: DateOrder): void;
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

  const review = useCallback(
    (source: ImportSource, fileName: string, parse: () => ParseResult) => {
      try {
        const parsed = parse();
        if (parsed.events.length === 0 && parsed.warnings.length > 0) return setState({ ...START, errors: parsed.warnings });
        const stored = toStored(events, principal);
        const diff = diffImport(stored, source === "csv" ? joinCsvToStored(parsed, stored) : parsed);
        setState({ step: "review", source, fileName, diff, warnings: parsed.warnings, error: "" });
      } catch (error: unknown) {
        setState({ ...START, errors: [`The file could not be read: ${messageOf(error)}`] });
      }
    },
    [events, principal],
  );

  const options = useCallback(() => ({ timeZone: timezone, privatePolicy: policy, ...importWindow(now) }), [timezone, policy, now]);

  const readText = useCallback(async (file: File): Promise<string | undefined> => {
    setState({ ...START, busy: true });
    try {
      return await file.text();
    } catch (error: unknown) {
      setState({ ...START, errors: [`The file could not be read: ${messageOf(error)}`] });
      return undefined;
    }
  }, []);

  const choose = useCallback(
    async (file: File) => {
      const text = await readText(file);
      if (text !== undefined) review("ics", file.name, () => parseIcs(text, options()));
    },
    [readText, review, options],
  );

  const chooseCsv = useCallback(
    async (file: File) => {
      const text = await readText(file);
      if (text === undefined) return;
      const order = detectDateOrder(text);
      if (order === "unknown") {
        const probe = parseCsv(text, { ...options(), dateOrder: "dmy" });
        if (probe.events.length === 0 && probe.warnings.length > 0) return setState({ ...START, errors: probe.warnings });
        return setState({ step: "order", fileName: file.name, text });
      }
      review("csv", file.name, () => parseCsv(text, { ...options(), dateOrder: order }));
    },
    [readText, review, options],
  );

  const pickOrder = useCallback(
    (order: DateOrder) => {
      if (state.step !== "order") return;
      const { fileName, text } = state;
      review("csv", fileName, () => parseCsv(text, { ...options(), dateOrder: order }));
    },
    [state, review, options],
  );

  const apply = useCallback(() => {
    if (state.step !== "review") return;
    const result = run({ now, principal, file: state.fileName, diff: state.diff });
    setState(result.ok ? { step: "done", fileName: state.fileName } : { ...state, error: result.error });
  }, [state, run, principal, now]);

  const reset = useCallback(() => setState(START), []);
  return { state, policy, choose, chooseCsv, pickOrder, apply, reset };
}
