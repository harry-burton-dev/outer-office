// The synthetic office for the Anime.js demos: one principal, a working week,
// seeded through the real commands so the screens render as they would live.
import { makeTestWorld, ok, NOW } from "../../../domain/commands/testing/world";
import { officeSave, principalSave, projectSave, taskAdd, importApply } from "../../../domain/commands";

export const ev = (uid: string, day: string, s: string, e: string, subject: string, location = "Room 1") => ({
  uid, recurrenceId: "", start: `${day}T${s}:00Z`, end: `${day}T${e}:00Z`, allDay: false, subject, location,
  organizer: "organiser@example.com", categories: "Internal", showAs: "busy", masked: false, sourceModified: "2026-11-20T09:00:00Z",
});
export const WEEK = [
  ev("a1", "2026-11-23", "09:00", "10:00", "Leadership team"), ev("a2", "2026-11-23", "11:00", "11:30", "1:1 Chief of Staff"),
  ev("a3", "2026-11-23", "14:00", "15:30", "Budget review"), ev("a4", "2026-11-24", "08:30", "09:00", "Morning brief"),
  ev("a5", "2026-11-24", "10:00", "11:00", "Board prep"), ev("a6", "2026-11-24", "10:30", "11:30", "Partner call"),
  ev("a7", "2026-11-24", "13:00", "14:00", "Lunch with funders", "Off site"), ev("a8", "2026-11-25", "09:30", "10:30", "Quarterly town hall"),
  ev("a9", "2026-11-25", "15:00", "16:00", "Recruitment panel"), ev("a10", "2026-11-26", "12:00", "13:30", "Press interview"),
  ev("a11", "2026-11-27", "09:00", "09:30", "Weekly wrap"), ev("a12", "2026-11-26", "16:00", "17:00", "Strategy offsite planning"),
];
const range = { rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-31T00:00:00Z", unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0 };
export const diff = (over: object) => ({ ...range, added: [], changed: [], gone: [], returned: [], ...over });

export async function makeOffice() {
  const world = await makeTestWorld();
  const device = await world.device("user-a");
  ok(device, officeSave, { now: NOW, name: "Synthetic Office", timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00", privatePolicy: "mask" });
  const principal = ok(device, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
  ok(device, projectSave, { now: NOW, name: "Office work" });
  ok(device, taskAdd, { now: NOW, title: "Send briefing pack", principal, due: "2026-11-25" });
  ok(device, importApply, { now: NOW, principal, file: "diary.ics", diff: diff({ added: WEEK }) });
  return { device, principal };
}
