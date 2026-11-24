import type { AppDefinition } from "@trellis/framework";
import { attendeesFromLines } from "./src/import/attendees.ts";

const str = { kind: "latest", type: "string" } as const;
const num = { kind: "latest", type: "number" } as const;
const bool = { kind: "latest", type: "boolean" } as const;
const askStr = { kind: "ask", type: "string" } as const;

const config = {
  id: "outer-office",
  name: "Outer Office",
  tables: {
    // The data model of design/v0.1-brief.md.
    office: {
      version: 3,
      // automate: the "Power Automate" setting (OO1). Off until an admin turns it on.
      // Version 3: the day summary's limits (OUT-84): a run longer than longRunHours
      // without a break, and place changes less than placeChangeMinutes apart.
      fields: { name: str, timezone: str, dayStart: str, dayEnd: str, privatePolicy: str, automate: bool, longRunHours: num, placeChangeMinutes: num },
    },
    principals: {
      version: 1,
      fields: { code: str, title: str, order: num, active: bool },
    },
    people: {
      version: 2,
      // Version 2: watchOff, the comma-separated Home watch rules this user turned off (OUT-58).
      fields: { userId: str, mode: str, privacyAckAt: str, watchOff: str },
    },
    // When a user last marked Home as seen, for one principal or for "me" (their own tasks) (OUT-58).
    seen: {
      version: 1,
      fields: { userId: str, scope: str, at: str },
    },
    events: {
      version: 3,
      fields: {
        principal: str, uid: str, recurrenceId: str, start: str, end: str, allDay: bool,
        subject: str, location: str, organizer: str, categories: str, showAs: str,
        masked: bool, gone: bool, sourceModified: str, moves: num, importId: str,
        // Version 2: the rest of what the diary sync carries (OUT-78).
        requiredAttendees: str, optionalAttendees: str, importance: str, sensitivity: str, created: str,
        // Version 3: everything Outlook sends (OUT-83, v0.3-brief.md section 3).
        // requiredAttendees and optionalAttendees are still written, from attendees.
        seriesId: str, outlookId: str, kind: str, source: str, attendees: "text",
        organizerAddress: str, locationType: str, online: bool, onlineProvider: str, joinUrl: str,
        hasAttachments: bool, webLink: str, response: str,
        isOrganizer: bool, responseRequested: bool, allowNewTimeProposals: bool,
        body: "text", raw: "text",
      },
    },
    // One row per field an import changed (OUT-83). For body, from and to stay
    // "" so the text isn't copied (D7). Written by imports only.
    eventHistory: {
      version: 1,
      fields: { event: str, at: str, importId: str, source: str, field: str, from: "text", to: "text" },
    },
    // Outlook categories, found by imports (OUT-83). Separate from tags: a
    // category never applies a tag. Id tx.id("category", lower-case name).
    categories: {
      version: 1,
      fields: { name: str, colour: str, order: num, firstSeen: str },
    },
    // One recurring meeting as a whole (OUT-83). Id tx.id("series", principal,
    // seriesId). Worked out again by imports from the stored occurrences.
    series: {
      version: 1,
      fields: {
        principal: str, seriesId: str, subject: str, organizer: str, pattern: str,
        firstStart: str, lastStart: str, count: num, exceptions: num,
      },
    },
    overlays: {
      version: 5,
      // Version 2: tags, comma-separated tag ids (OUT-76).
      // Version 3: archived, when the office archived the event ("" when it is not).
      // Version 4: archiveReason, why it was archived (OUT-66; "" when it is not).
      // Version 5 (OUT-84): quiet (never clashes), parent (the event it is linked
      // under, or ""), and priority (1 to 4, the task scale; 4 is none set).
      fields: {
        event: str, prep: str, flagged: bool, prepOwner: askStr, notes: "text", outcome: "text", tags: str, archived: str, archiveReason: str,
        quiet: bool, parent: str, priority: num,
      },
    },
    // The office's tags, shared by tasks and events (OUT-76). An event also
    // carries a tag when one of its Outlook categories has the tag's name.
    tags: {
      version: 1,
      fields: { name: str, colour: str, order: num },
    },
    // A proposed change to an event, not yet made in Outlook (OUT-77). One per
    // event: the Proposed layer shows it at its new time, and the live diary
    // leaves a ghost behind until it is done or withdrawn.
    // Version 2: a proposal can be a new meeting (kind "new", no event), with
    // the fields Outlook needs to create it.
    proposals: {
      version: 2,
      fields: {
        event: str, principal: str, start: str, end: str, by: str, at: str,
        kind: str, subject: str, allDay: bool, location: str, online: bool,
        requiredAttendees: str, optionalAttendees: str, categories: str,
        showAs: str, importance: str, sensitivity: str, notes: "text",
      },
    },
    // Card templates (OUT-62): a shape shown on the meeting and a form, as JSON
    // fields [{ id, label, type, options, required }].
    templates: {
      version: 1,
      fields: { name: str, shape: str, fields: "text", order: num },
    },
    // A card on a meeting: one template's form, filled in. values is JSON { fieldId: value }.
    cards: {
      version: 1,
      fields: { event: str, template: str, values: "text", order: num },
    },
    projects: {
      version: 1,
      fields: { name: str, owner: str, order: num, inbox: bool, archived: bool },
    },
    sections: {
      version: 1,
      fields: { project: str, name: str, order: num },
    },
    tasks: {
      version: 2,
      fields: {
        title: str, notes: "text", project: str, section: str, order: num, priority: num,
        due: str, deadline: askStr, done: bool, doneAt: str, doneBy: str,
        assignee: askStr, assignedBy: str, assignment: str, principal: str, event: str,
        createdAt: str, createdBy: str,
        // Version 2: tags, comma-separated tag ids (OUT-76).
        tags: str,
      },
    },
    log: {
      version: 1,
      fields: {
        at: str, by: str, principal: str, area: str, kind: str,
        event: str, task: str, from: str, to: str, note: str,
      },
    },
    imports: {
      version: 1,
      fields: {
        principal: str, at: str, by: str, rangeStart: str, rangeEnd: str,
        added: num, changed: num, gone: num,
      },
    },
    // The last file each Power Automate flow left for a principal, and what the
    // app did with it (OUT-91), for the Automate page. One record per flow and
    // principal code, overwritten on each run. An unchanged run counts too.
    flowRuns: {
      version: 1,
      fields: {
        flow: str, principal: str, file: str, fileAt: str, readAt: str, readBy: str,
        outcome: str, reason: str, added: num, changed: num, gone: num, events: num,
      },
    },
  },
  migrations: {
    office: {
      1: (record) => ({ ...record, automate: record.automate ?? false }),
      2: (record) => ({ ...record, longRunHours: record.longRunHours ?? 4, placeChangeMinutes: record.placeChangeMinutes ?? 30 }),
    },
    overlays: {
      1: (record) => ({ ...record, tags: record.tags ?? "" }),
      2: (record) => ({ ...record, archived: record.archived ?? "" }),
      3: (record) => ({ ...record, archiveReason: record.archiveReason ?? (record.archived ? "unknown" : "") }),
      4: (record) => ({ ...record, quiet: record.quiet ?? false, parent: record.parent ?? "", priority: record.priority ?? 4 }),
    },
    proposals: {
      1: (record) => ({
        ...record, kind: record.kind ?? "move", subject: record.subject ?? "", allDay: record.allDay ?? false, location: record.location ?? "",
        online: record.online ?? false, requiredAttendees: record.requiredAttendees ?? "", optionalAttendees: record.optionalAttendees ?? "",
        categories: record.categories ?? "", showAs: record.showAs ?? "", importance: record.importance ?? "", sensitivity: record.sensitivity ?? "", notes: record.notes ?? "",
      }),
    },
    tasks: { 1: (record) => ({ ...record, tags: record.tags ?? "" }) },
    people: { 1: (record) => ({ ...record, watchOff: record.watchOff ?? "" }) },
    events: {
      1: (record) => ({
        ...record,
        requiredAttendees: record.requiredAttendees ?? "", optionalAttendees: record.optionalAttendees ?? "",
        importance: record.importance ?? "", sensitivity: record.sensitivity ?? "", created: record.created ?? "",
      }),
      // source stays "" (not known) for a row from before v3, except a CSV row's derived uid.
      2: (record) => ({
        ...record,
        seriesId: record.seriesId ?? (record.recurrenceId ? record.uid ?? "" : ""),
        kind: record.kind ?? (record.recurrenceId ? "occurrence" : "single"),
        source: record.source ?? (String(record.uid ?? "").startsWith("csv:") ? "csv" : ""),
        outlookId: record.outlookId ?? "",
        attendees: record.attendees ?? JSON.stringify(attendeesFromLines(String(record.requiredAttendees ?? ""), String(record.optionalAttendees ?? ""))),
        organizerAddress: record.organizerAddress ?? "", locationType: record.locationType ?? "",
        online: record.online ?? false, onlineProvider: record.onlineProvider ?? "", joinUrl: record.joinUrl ?? "",
        hasAttachments: record.hasAttachments ?? false, webLink: record.webLink ?? "", response: record.response ?? "",
        isOrganizer: record.isOrganizer ?? false, responseRequested: record.responseRequested ?? false,
        allowNewTimeProposals: record.allowNewTimeProposals ?? false, body: record.body ?? "", raw: record.raw ?? "",
      }),
    },
  },
} satisfies AppDefinition;

export default config;

// Row types are inferred from this definition (spec S2).
declare module "@trellis/framework" {
  interface Register {
    config: typeof config;
  }
}
