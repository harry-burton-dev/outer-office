// Diary sync end to end in the app: with Power Automate on, each file in the
// inbox is applied on the sync tick without a review (OO2 Q3), logged, and its
// files deleted. A file that can't be used shows in Needs action and on Import.
// With the setting off, the inbox is never read; a viewer never applies.
import { afterEach, describe, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { AppFrame } from "@/app/app-frame";
import { cleanupApp, renderApp, type Seeder } from "@/app/testing/render-app";
import { rows } from "@/domain/commands/testing/world";
import { MAIN_PAYLOAD, MAIN_PAYLOAD_EVENTS } from "@/import/fixtures/diary-payload";
import { UID } from "@/import/fixtures/outlook-ics";
import type { DiaryEvent } from "@/import/parse-automate";
import { DIARY_INBOX } from "./diary-inbox";
import { diaryEvent } from "./testing/diary-event";
import { memoryPlainFiles } from "./testing/memory-plain-files";

afterEach(cleanupApp);

const A = `${DIARY_INBOX}/PRINCIPAL-A`;
const NEWEST = `${A}/20261123T210000Z.json`;
const OLDER = `${A}/20261123T203000Z.json`;

const inbox = () => memoryPlainFiles("automate", { [OLDER]: diaryEvent("2026-11-23T20:30:00Z"), [NEWEST]: diaryEvent("2026-11-23T21:00:00Z") });
const payloadOf = (events: readonly DiaryEvent[]) => ({ ...MAIN_PAYLOAD, count: events.length, events });
const syncNotes = (app: Awaited<ReturnType<typeof renderApp>>) =>
  rows(app.device, "log").filter((r) => r.area === "import").map((r) => r.note);

function seed(automate: boolean) {
  return (s: Seeder) => {
    s.office({ name: "Test Office", timezone: "Europe/London", automate });
    s.principal("PRINCIPAL-A");
  };
}

describe("diary sync", () => {
  test("a diary update is applied on the tick, logged, and its files deleted", async () => {
    const files = inbox();
    const app = await renderApp({ seed: seed(true), plainFiles: files, children: <AppFrame /> });
    await app.tick();
    expect(rows(app.device, "events").filter((e) => e.principal !== undefined)).toHaveLength(23);
    expect(rows(app.device, "imports")).toHaveLength(1);
    expect(syncNotes(app)).toEqual(["Power Automate sync: 23 added, 0 changed, 0 gone, 0 returned"]);
    await app.tick();
    expect([...files.files.keys()]).toEqual([]);
    expect(screen.getByRole("button", { name: "Needs action 0" })).toBeTruthy();
  });

  test("the next run applies moved, added and gone events", async () => {
    const files = inbox();
    const app = await renderApp({ seed: seed(true), plainFiles: files, children: <AppFrame /> });
    await app.tick();
    const later = "2026-11-23T21:20:00.0000000Z";
    const events = MAIN_PAYLOAD_EVENTS
      .filter((e) => e.iCalUId !== UID.remoteTeam)
      .map((e) => (e.iCalUId === UID.lunch ? { ...e, start: "2026-10-13T12:00:00.0000000", end: "2026-10-13T13:00:00.0000000", lastModifiedDateTime: later } : e));
    const added: DiaryEvent = { ...(MAIN_PAYLOAD_EVENTS.find((e) => e.iCalUId === UID.lunch) as DiaryEvent), iCalUId: "new-meeting", subject: "New meeting", lastModifiedDateTime: later,
      attendees: [{ type: "required", status: { response: "accepted" }, emailAddress: { name: "Alex Example", address: "alex@example.invalid" } }] };
    await files.write(`${A}/20261123T213000Z.json`, diaryEvent("2026-11-23T21:30:00Z", payloadOf([...events, added])));
    await app.tick();

    expect(syncNotes(app).sort()).toEqual(["Power Automate sync: 1 added, 1 changed, 1 gone, 0 returned", "Power Automate sync: 23 added, 0 changed, 0 gone, 0 returned"]);
    const stored = rows(app.device, "events");
    expect(stored.find((e) => e.uid === UID.lunch)).toMatchObject({ start: "2026-10-13T12:00:00.000Z", moves: 1 });
    expect(stored.find((e) => e.uid === UID.remoteTeam)).toMatchObject({ gone: true });
    expect(stored.find((e) => e.uid === "new-meeting")).toMatchObject({ subject: "New meeting", gone: false, requiredAttendees: "Alex Example <alex@example.invalid> · accepted" });
    await app.tick();
    expect([...files.files.keys()]).toEqual([]);
  });

  test("a run that changes nothing is used up and leaves no log entry", async () => {
    const files = inbox();
    const app = await renderApp({ seed: seed(true), plainFiles: files, children: <AppFrame /> });
    await app.tick();
    await files.write(`${A}/20261123T213000Z.json`, diaryEvent("2026-11-23T21:30:00Z"));
    await app.tick();
    await app.tick();
    expect(rows(app.device, "imports")).toHaveLength(1);
    expect(syncNotes(app)).toHaveLength(1);
    expect([...files.files.keys()]).toEqual([]);
  });

  test("a run where Outlook moved only the modified time leaves no import or log entry", async () => {
    const files = inbox();
    const app = await renderApp({ seed: seed(true), plainFiles: files, children: <AppFrame /> });
    await app.tick();
    const touched = MAIN_PAYLOAD_EVENTS.map((e) => (e.iCalUId === UID.lunch ? { ...e, lastModifiedDateTime: "2026-11-23T21:20:00.0000000Z" } : e));
    for (const at of ["213000", "214500"]) {
      await files.write(`${A}/20261123T${at}Z.json`, diaryEvent(`2026-11-23T${at.slice(0, 2)}:${at.slice(2, 4)}:00Z`, payloadOf(touched)));
      await app.tick();
      await app.tick();
    }
    expect(rows(app.device, "imports")).toHaveLength(1);
    expect(syncNotes(app)).toHaveLength(1);
  });

  test("a payload the adapter refuses shows why, and nothing is applied", async () => {
    const files = memoryPlainFiles("automate", { [NEWEST]: diaryEvent("2026-11-23T21:00:00Z", { ...MAIN_PAYLOAD, count: 99 }) });
    const app = await renderApp({ seed: seed(true), plainFiles: files, children: <AppFrame /> });
    await app.tick();
    fireEvent.click(screen.getByRole("button", { name: "Needs action 1" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Diary update can't be used" }));
    expect(screen.getByRole("alert").textContent).toContain("may be cut off");
    expect(rows(app.device, "events")).toHaveLength(0);
    expect(files.files.has(NEWEST)).toBe(true);
  });

  test("a run that would mark most events gone is held back", async () => {
    const files = inbox();
    const app = await renderApp({ seed: seed(true), plainFiles: files, children: <AppFrame /> });
    await app.tick();
    const HELD = `${A}/20261123T213000Z.json`;
    await files.write(HELD, diaryEvent("2026-11-23T21:30:00Z", payloadOf(MAIN_PAYLOAD_EVENTS.slice(0, 3))));
    await app.tick();
    expect(rows(app.device, "events").filter((e) => e.gone === true)).toHaveLength(0);
    expect(syncNotes(app)).toHaveLength(1);
    expect(files.files.has(HELD)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Needs action 1" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Diary update can't be used" }));
    expect(screen.getByRole("alert").textContent).toMatch(/would mark \d+ of \d+ events gone, so it was held back/);
  });

  test("an unusable file shows in Needs action and on Import with the reason", async () => {
    const files = memoryPlainFiles("automate", { [NEWEST]: diaryEvent("2026-11-23T21:00:00Z", { ...MAIN_PAYLOAD, principal: "PRINCIPAL-B" }) });
    const app = await renderApp({ seed: seed(true), plainFiles: files, children: <AppFrame /> });
    await app.tick();
    fireEvent.click(screen.getByRole("button", { name: "Needs action 1" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Diary update can't be used" }));
    expect(screen.getByRole("alert").textContent).toBe("The latest diary update can't be used: it is for PRINCIPAL-B, but is in PRINCIPAL-A's folder.");
  });

  test("with Power Automate off, the inbox is never read", async () => {
    const files = inbox();
    const app = await renderApp({ seed: seed(false), plainFiles: files, children: <AppFrame /> });
    await app.tick();
    expect(files.reads).toBe(0);
    expect(screen.getByRole("button", { name: "Needs action 0" })).toBeTruthy();
  });

  test("a viewer never applies the update", async () => {
    const files = inbox();
    const app = await renderApp({ seed: (s) => { seed(true)(s); s.viewer(); }, plainFiles: files, children: <AppFrame /> });
    await app.tick();
    expect(screen.getByRole("button", { name: "Needs action 0" })).toBeTruthy();
    expect(rows(app.device, "events")).toHaveLength(0);
    expect(files.files.has(NEWEST)).toBe(true);
  });
});
