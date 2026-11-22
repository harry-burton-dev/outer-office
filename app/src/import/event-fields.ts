// Reads the descriptive fields of one VEVENT component into ImportedEvent shape.
import ICAL from "ical.js";

type Component = InstanceType<typeof ICAL.Component>;

export interface EventDetails {
  subject: string;
  location: string;
  organizer: string;
  categories: string;
  showAs: string;
  sourceModified: string;
}

const BUSY_STATUSES: Readonly<Record<string, string>> = { BUSY: "busy", TENTATIVE: "tentative", FREE: "free", OOF: "oof" };
const PRIVATE_CLASSES = new Set(["PRIVATE", "CONFIDENTIAL"]);
export const MASKED_SUBJECT = "Private, busy";

/** A property's first value as text, or "" when absent or not text. */
export function textOf(component: Component, name: string): string {
  const value = component.getFirstPropertyValue(name);
  return typeof value === "string" ? value : "";
}

function utcIsoOf(component: Component, name: string): string {
  const value = component.getFirstPropertyValue(name);
  if (!(value instanceof ICAL.Time)) return "";
  const utc = value.zone === ICAL.Timezone.utcTimezone || value.zone === ICAL.Timezone.localTimezone
    ? Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second)
    : value.toUnixTime() * 1000;
  return new Date(utc).toISOString();
}

function organizerOf(component: Component): string {
  const prop = component.getFirstProperty("organizer");
  if (!prop) return "";
  const cn = prop.getParameter("cn");
  const name = Array.isArray(cn) ? cn.join(", ") : cn;
  if (typeof name === "string" && name.trim() !== "") return name.trim();
  const address = prop.getFirstValue();
  return typeof address === "string" ? address.replace(/^mailto:/i, "") : "";
}

function categoriesOf(component: Component): string {
  return component.getAllProperties("categories")
    .flatMap((prop) => prop.getValues())
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim())
    .join(", ");
}

function showAsOf(component: Component): string {
  const status = BUSY_STATUSES[textOf(component, "x-microsoft-cdo-busystatus").toUpperCase()];
  if (status) return status;
  return textOf(component, "transp").toUpperCase() === "TRANSPARENT" ? "free" : "busy";
}

export function detailsOf(component: Component): EventDetails {
  return {
    subject: textOf(component, "summary"),
    location: textOf(component, "location"),
    organizer: organizerOf(component),
    categories: categoriesOf(component),
    showAs: showAsOf(component),
    sourceModified: utcIsoOf(component, "last-modified") || utcIsoOf(component, "dtstamp"),
  };
}

export const isPrivate = (component: Component): boolean => PRIVATE_CLASSES.has(textOf(component, "class").toUpperCase());
export const isCancelled = (component: Component): boolean => textOf(component, "status").toUpperCase() === "CANCELLED";

/** The private policy's "mask": times and showAs stay, everything identifying goes. */
export const maskDetails = (details: EventDetails): EventDetails => ({
  ...details, subject: MASKED_SUBJECT, location: "", organizer: "", categories: "",
});
