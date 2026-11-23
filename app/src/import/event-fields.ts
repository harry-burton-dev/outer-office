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
  requiredAttendees: string;
  optionalAttendees: string;
  importance: string;
  sensitivity: string;
  created: string;
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

const RESPONSES: Readonly<Record<string, string>> = {
  ACCEPTED: "accepted", TENTATIVE: "tentative", DECLINED: "declined", "NEEDS-ACTION": "no response", DELEGATED: "delegated",
};

/** Attendees with the given ROLE, one per line: "Name <address> · response". */
function attendeesOf(component: Component, optional: boolean): string {
  return component.getAllProperties("attendee")
    .filter((prop) => (String(prop.getParameter("role") ?? "REQ-PARTICIPANT").toUpperCase() === "OPT-PARTICIPANT") === optional)
    .map((prop) => {
      const address = String(prop.getFirstValue() ?? "").replace(/^mailto:/i, "");
      const cn = prop.getParameter("cn");
      const name = (Array.isArray(cn) ? cn.join(", ") : cn ?? "").trim();
      const response = RESPONSES[String(prop.getParameter("partstat") ?? "").toUpperCase()] ?? "";
      return [name ? `${name} <${address}>` : address, response].filter(Boolean).join(" · ");
    })
    .join("\n");
}

/** RFC 5545 PRIORITY: 1-4 high, 5 or none normal, 6-9 low. */
function importanceOf(component: Component): string {
  const priority = Number(component.getFirstPropertyValue("priority") ?? 0);
  return priority >= 1 && priority <= 4 ? "high" : priority >= 6 ? "low" : "normal";
}

function sensitivityOf(component: Component): string {
  const value = textOf(component, "class").toUpperCase();
  return value === "PRIVATE" ? "private" : value === "CONFIDENTIAL" ? "confidential" : "normal";
}

export function detailsOf(component: Component): EventDetails {
  return {
    subject: textOf(component, "summary"),
    location: textOf(component, "location"),
    organizer: organizerOf(component),
    categories: categoriesOf(component),
    showAs: showAsOf(component),
    sourceModified: utcIsoOf(component, "last-modified") || utcIsoOf(component, "dtstamp"),
    requiredAttendees: attendeesOf(component, false),
    optionalAttendees: attendeesOf(component, true),
    importance: importanceOf(component),
    sensitivity: sensitivityOf(component),
    created: utcIsoOf(component, "created"),
  };
}

export const isPrivate = (component: Component): boolean => PRIVATE_CLASSES.has(textOf(component, "class").toUpperCase());
export const isCancelled = (component: Component): boolean => textOf(component, "status").toUpperCase() === "CANCELLED";

/** The private policy's "mask": times and showAs stay, everything identifying goes. */
export const maskDetails = (details: EventDetails): EventDetails => ({
  ...details, subject: MASKED_SUBJECT, location: "", organizer: "", categories: "", requiredAttendees: "", optionalAttendees: "",
});
