// office.save and principal.save: the setup records.
import { defineCommand, type Tx } from "@trellis/framework";
import { changedKeys, defined, optionalBoolean, optionalNumber, optionalText, requireNow, requireText, writeLog } from "./shared";

export const OFFICE_ID = "office";
export type PrivatePolicy = "drop" | "mask";

export interface OfficeSaveInput {
  now: string;
  name?: string;
  /** IANA zone, such as Europe/London. */
  timezone?: string;
  /** "08:00" */
  dayStart?: string;
  dayEnd?: string;
  privatePolicy?: PrivatePolicy;
  /** The Power Automate setting: whether the app reads diary updates from the automate/ folder. */
  automate?: boolean;
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function isZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function checkOffice(tx: Tx, input: OfficeSaveInput): Omit<OfficeSaveInput, "now"> {
  const name = input.name === undefined ? undefined : requireText(tx, input.name, "The office name");
  const timezone = optionalText(tx, input.timezone, "The time zone");
  if (timezone !== undefined && !isZone(timezone)) tx.fail(`"${timezone}" is not a time zone this computer knows, such as Europe/London.`);
  const dayStart = optionalText(tx, input.dayStart, "The start of the day");
  const dayEnd = optionalText(tx, input.dayEnd, "The end of the day");
  for (const time of [dayStart, dayEnd]) if (time !== undefined && !CLOCK.test(time)) tx.fail(`"${time}" is not a time written as HH:MM, such as 08:00.`);
  if (input.privatePolicy !== undefined && input.privatePolicy !== "drop" && input.privatePolicy !== "mask") tx.fail("Private items must be either dropped or masked.");
  const automate = optionalBoolean(tx, input.automate, "Power Automate");
  return defined({ name, timezone, dayStart, dayEnd, privatePolicy: input.privatePolicy, automate });
}

export const officeSave = defineCommand("office.save", (tx: Tx, input: OfficeSaveInput) => {
  const now = requireNow(tx, input);
  const fields = checkOffice(tx, input);
  const current = tx.get("office", OFFICE_ID);
  const merged = { ...current, ...fields };
  if (!current && (merged.name === undefined || merged.timezone === undefined)) tx.fail("A new office needs a name and a time zone.");
  if (merged.dayStart !== undefined && merged.dayEnd !== undefined && merged.dayStart >= merged.dayEnd) tx.fail("The day must end after it starts.");
  const changed = changedKeys(current ?? {}, fields);
  if (changed.length === 0) return OFFICE_ID;
  tx.put("office", OFFICE_ID, fields);
  writeLog(tx, now, { area: "setup", kind: current ? "office-changed" : "office-created", note: `Changed: ${changed.join(", ")}` });
  return OFFICE_ID;
});

export interface PrincipalSaveInput {
  now: string;
  /** Leave out to create; the new id is tx.id("principal", code). */
  id?: string;
  code?: string;
  title?: string;
  order?: number;
  active?: boolean;
}

const CODE = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

function createPrincipal(tx: Tx, now: string, input: PrincipalSaveInput): string {
  const code = requireText(tx, input.code, "The principal's code");
  if (!CODE.test(code)) tx.fail("A principal's code may use only letters, digits and hyphens, such as PRINCIPAL-A.");
  const title = requireText(tx, input.title, "The principal's title");
  const id = tx.id("principal", code);
  const existing = tx.get("principals", id);
  if (existing && !existing._deleted) tx.fail(`There is already a principal with the code ${code}.`);
  if (existing?._deleted) tx.restore("principals", id);
  const order = optionalNumber(tx, input.order, "The order") ?? Math.max(0, ...tx.list("principals").map((p) => p.order ?? 0)) + 1;
  tx.put("principals", id, { code, title, order, active: optionalBoolean(tx, input.active, "Active") ?? true });
  writeLog(tx, now, { area: "setup", kind: "principal-added", principal: id, note: `${code}: ${title}` });
  return id;
}

function changePrincipal(tx: Tx, now: string, id: string, input: PrincipalSaveInput): string {
  const current = tx.get("principals", id);
  if (!current || current._deleted) tx.fail("That principal no longer exists.");
  if (input.code !== undefined && input.code !== current.code) tx.fail("A principal's code can't be changed, as imported events are filed under it.");
  const fields = defined({
    title: input.title === undefined ? undefined : requireText(tx, input.title, "The principal's title"),
    order: optionalNumber(tx, input.order, "The order"),
    active: optionalBoolean(tx, input.active, "Active"),
  });
  const changed = changedKeys(current, fields);
  if (changed.length === 0) return id;
  tx.put("principals", id, fields);
  writeLog(tx, now, { area: "setup", kind: "principal-changed", principal: id, note: `Changed: ${changed.join(", ")}` });
  return id;
}

export const principalSave = defineCommand("principal.save", (tx: Tx, input: PrincipalSaveInput) => {
  const now = requireNow(tx, input);
  if (input.id === undefined) return createPrincipal(tx, now, input);
  return changePrincipal(tx, now, requireText(tx, input.id, "The principal's id"), input);
});
