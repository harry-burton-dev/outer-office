import type { AppDefinition } from "@trellis/framework";

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
      version: 1,
      fields: { name: str, timezone: str, dayStart: str, dayEnd: str, privatePolicy: str },
    },
    principals: {
      version: 1,
      fields: { code: str, title: str, order: num, active: bool },
    },
    people: {
      version: 1,
      fields: { userId: str, mode: str, privacyAckAt: str },
    },
    events: {
      version: 2,
      fields: {
        principal: str, uid: str, recurrenceId: str, start: str, end: str, allDay: bool,
        subject: str, location: str, organizer: str, categories: str, showAs: str,
        masked: bool, gone: bool, sourceModified: str, moves: num, importId: str,
        // Version 2: the rest of what the diary sync carries (OUT-78).
        requiredAttendees: str, optionalAttendees: str, importance: str, sensitivity: str, created: str,
      },
    },
    overlays: {
      version: 2,
      // Version 2: tags, comma-separated tag ids (OUT-76).
      fields: { event: str, prep: str, flagged: bool, prepOwner: askStr, notes: "text", outcome: "text", tags: str },
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
    proposals: {
      version: 1,
      fields: { event: str, principal: str, start: str, end: str, by: str, at: str },
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
  },
  migrations: {
    overlays: { 1: (record) => ({ ...record, tags: record.tags ?? "" }) },
    tasks: { 1: (record) => ({ ...record, tags: record.tags ?? "" }) },
    events: {
      1: (record) => ({
        ...record,
        requiredAttendees: record.requiredAttendees ?? "", optionalAttendees: record.optionalAttendees ?? "",
        importance: record.importance ?? "", sensitivity: record.sensitivity ?? "", created: record.created ?? "",
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
