// The pure half of the admin page's office setup: checks and the inputs for
// office.save and principal.save, built from what the admin typed. No DOM.
import type { OfficeSaveInput, PrincipalSaveInput, PrivatePolicy } from "@/domain/commands";

export type Built<T> = { readonly ok: true; readonly input: T } | { readonly ok: false; readonly error: string };

export interface OfficeForm {
  readonly name: string;
  readonly timezone: string;
  readonly dayStart: string;
  readonly dayEnd: string;
  readonly privatePolicy: string;
}

export interface PrincipalRow {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly order: number;
  readonly active: boolean;
}

export interface PrincipalEdit {
  readonly title: string;
  /** As typed: a number, or empty to leave it. */
  readonly order: string;
  readonly active: boolean;
}

const CODE = /^[A-Z0-9][A-Z0-9-]*$/;
const POLICIES: readonly PrivatePolicy[] = ["mask", "drop"];
const failed = <T>(error: string): Built<T> => ({ ok: false, error });

/** Whether this computer knows the IANA time zone, such as Europe/London. */
export function isTimeZone(zone: string): boolean {
  if (zone.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone.trim() });
    return true;
  } catch {
    return false;
  }
}

/** The office.save input for the form. Empty times are left out; the command checks the rest. */
export function officeInput(form: OfficeForm, now: string): Built<OfficeSaveInput> {
  const timezone = form.timezone.trim();
  if (!isTimeZone(timezone)) return failed(`"${timezone}" is not a time zone this computer knows, such as Europe/London.`);
  const policy = POLICIES.find((p) => p === form.privatePolicy);
  if (!policy) return failed("Choose whether private items are masked or dropped.");
  const dayStart = form.dayStart.trim();
  const dayEnd = form.dayEnd.trim();
  return {
    ok: true,
    input: { now, name: form.name.trim(), timezone, privatePolicy: policy, ...(dayStart ? { dayStart } : {}), ...(dayEnd ? { dayEnd } : {}) },
  };
}

/** A principal's code as stored: trimmed and upper case. */
export const normaliseCode = (code: string): string => code.trim().toUpperCase();

/** The principal.save input that adds a principal. */
export function newPrincipalInput(code: string, title: string, now: string): Built<PrincipalSaveInput> {
  const normal = normaliseCode(code);
  if (!CODE.test(normal)) return failed("A code may use only letters, digits and hyphens, such as PRINCIPAL-A.");
  if (title.trim() === "") return failed("Enter the principal's title.");
  return { ok: true, input: { now, code: normal, title: title.trim() } };
}

/** The principal.save input that changes a row, with only the fields that differ; null when nothing does. */
export function principalChange(row: PrincipalRow, edit: PrincipalEdit, now: string): Built<PrincipalSaveInput> | null {
  const order = edit.order.trim() === "" ? row.order : Number(edit.order);
  if (!Number.isFinite(order)) return failed(`The order for ${row.code} must be a number.`);
  const title = edit.title.trim();
  const fields = {
    ...(title !== row.title ? { title } : {}),
    ...(order !== row.order ? { order } : {}),
    ...(edit.active !== row.active ? { active: edit.active } : {}),
  };
  if (Object.keys(fields).length === 0) return null;
  return { ok: true, input: { now, id: row.id, ...fields } };
}

/** Principals in their order, then by code. */
export function sortPrincipals(rows: readonly PrincipalRow[]): PrincipalRow[] {
  return [...rows].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
}
