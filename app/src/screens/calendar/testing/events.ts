// Test helper (not shipped): puts synthetic events in through the real
// import.apply command, and finds their ids afterwards.
import type { ImportDiff, ImportedEvent, StoredEvent } from "@/import/types";
import { importApply } from "@/domain/commands";
import type { Seeder } from "@/app/testing/render-app";
import type { Device } from "@/domain/commands/testing/world";

export const MONDAY_NOW = "2026-11-23T09:00:00.000Z";

export const syntheticEvent = (uid: string, over: Partial<ImportedEvent> = {}): ImportedEvent => ({
  uid, recurrenceId: "", start: "2026-11-24T14:00:00Z", end: "2026-11-24T15:00:00Z", allDay: false,
  subject: `Meeting ${uid}`, location: "Room 1", organizer: "organiser@example.com", categories: "Internal",
  showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z", ...over,
});

const diff = (over: Partial<ImportDiff>): ImportDiff => ({
  rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-31T00:00:00Z", added: [], changed: [], gone: [], returned: [],
  unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0, ...over,
});

const stored = (event: ImportedEvent, principal: string): StoredEvent => ({ ...event, id: "", principal, gone: false, moves: 0 });

/** Adds events for a principal in one import. */
export function importEvents(s: Seeder, now: string, principal: string, events: readonly ImportedEvent[]): void {
  s.run(importApply, { now, principal, file: "diary.ics", diff: diff({ added: events }) });
}

/** Marks an event gone with a later import. */
export function markGone(s: Seeder, now: string, principal: string, event: ImportedEvent): void {
  s.run(importApply, { now, principal, file: "diary.ics", diff: diff({ gone: [stored(event, principal)] }) });
}

/** Moves an event's start with a later import, so moves goes up by one. */
export function moveEvent(s: Seeder, now: string, principal: string, event: ImportedEvent, start: string, end: string): void {
  const after = { ...event, start, end, sourceModified: "2026-11-21T09:00:00Z" };
  s.run(importApply, { now, principal, file: "diary.ics", diff: diff({ changed: [{ before: stored(event, principal), after, fields: ["start", "end"], moved: true }] }) });
}

/** The stored id of the principal's event with this uid. */
export function eventIdOf(device: Device, principal: string, uid: string): string {
  const rows = device.data.view("events").rows() as unknown as ReadonlyArray<{ id: string; uid?: string; principal?: string }>;
  const row = rows.find((r) => r.uid === uid && r.principal === principal);
  if (!row) throw new Error(`no event ${uid}`);
  return row.id;
}
