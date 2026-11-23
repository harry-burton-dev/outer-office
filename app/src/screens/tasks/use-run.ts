// Runs a command with the current time filled in and keeps the last failure
// as plain text, so a screen can show it inline.
import { useCallback, useState } from "react";
import { useCommand, type CommandDef } from "@trellis/framework";

export interface Runner<I> {
  /** Runs the command; true when it worked. */
  run(input: Omit<I, "now">): boolean;
  error: string | null;
  clearError(): void;
}

export function useRun<I extends { now: string }, V>(command: CommandDef<I, V>): Runner<I> {
  const exec = useCommand(command);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    (input: Omit<I, "now">) => {
      const result = exec({ ...input, now: new Date().toISOString() } as I);
      setError(result.ok ? null : result.error);
      return result.ok;
    },
    [exec],
  );
  const clearError = useCallback(() => setError(null), []);
  return { run, error, clearError };
}

/** The first failure of several runners, or null. */
export const firstError = (...runners: readonly { error: string | null }[]): string | null =>
  runners.find((r) => r.error !== null)?.error ?? null;
