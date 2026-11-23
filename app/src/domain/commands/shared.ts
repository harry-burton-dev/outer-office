// Checks and the log writer shared by every command.
import type { Tx } from "@trellis/framework";

export type LogArea = "calendar" | "overlay" | "task" | "import" | "setup" | "proposal";

export interface LogEntry {
  readonly area: LogArea;
  readonly kind: string;
  readonly principal?: string;
  readonly event?: string;
  readonly task?: string;
  readonly from?: string;
  readonly to?: string;
  readonly note?: string;
}

/** Appends one row to the log, stamped with the run's `now` and user. */
export function writeLog(tx: Tx, now: string, entry: LogEntry): void {
  tx.put("log", tx.newId(), {
    at: now,
    by: tx.user,
    principal: entry.principal ?? "",
    area: entry.area,
    kind: entry.kind,
    event: entry.event ?? "",
    task: entry.task ?? "",
    from: entry.from ?? "",
    to: entry.to ?? "",
    note: entry.note ?? "",
  });
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoInstant = (value: unknown): value is string =>
  typeof value === "string" && ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value));

export const isDateOnly = (value: unknown): value is string =>
  typeof value === "string" && DATE_ONLY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** Fails unless the input is an object carrying `now` as an ISO UTC instant. */
export function requireNow(tx: Tx, input: unknown): string {
  if (input === null || typeof input !== "object") tx.fail("The command was given nothing to work with.");
  const now = (input as { now?: unknown }).now;
  if (!isIsoInstant(now)) tx.fail("The current time is missing or is not an ISO date and time in UTC.");
  return now;
}

/** Fails unless the value is a string with something other than spaces in it; returns it trimmed. */
export function requireText(tx: Tx, value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") tx.fail(`${label} can't be empty.`);
  return value.trim();
}

/** Fails unless the value is undefined or a string; returns it trimmed. */
export function optionalText(tx: Tx, value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") tx.fail(`${label} must be text.`);
  return value.trim();
}

/** Fails unless the value is undefined, "" (none) or a YYYY-MM-DD date. */
export function optionalDate(tx: Tx, value: unknown, label: string): string | undefined {
  if (value === undefined || value === "") return value;
  if (!isDateOnly(value)) tx.fail(`${label} must be a date written as YYYY-MM-DD.`);
  return value;
}

/** Fails unless the value is undefined or a finite number. */
export function optionalNumber(tx: Tx, value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) tx.fail(`${label} must be a number.`);
  return value;
}

/** Fails unless the value is undefined or true or false. */
export function optionalBoolean(tx: Tx, value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") tx.fail(`${label} must be yes or no.`);
  return value;
}

/** The fields of `next` whose values differ from `current`. */
export function changedKeys<N extends object>(current: object, next: N): (keyof N & string)[] {
  const before = current as Record<string, unknown>;
  return (Object.keys(next) as (keyof N & string)[]).filter((key) => next[key] !== undefined && next[key] !== before[key]);
}

/** Removes the keys whose value is undefined, so a write never sets undefined. */
export function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
