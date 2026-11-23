// The Import screen: choose, review, apply, the delete reminder, and history.
import { afterEach, describe, expect, test } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { importApply, overlaySet } from "@/domain/commands";
import { calendar, MAIN_EVENTS, MAIN_FIXTURE, UID, vevent } from "@/import/fixtures/outlook-ics";
import { cleanupApp, NOW, renderApp, type Seeder } from "@/app/testing/render-app";
import { idOf, rows } from "@/domain/commands/testing/world";
import { ImportScreen } from "../import-screen";

afterEach(cleanupApp);

// With the screen's window (6 months back, 12 forward of 22 Nov 2026) every occurrence
// in the main fixture is kept: 8 weekly reviews, 8 stand-ups, 4 project syncs, office closed,
// conference, the masked private appointment, remote call, lunch, reminder, workshop,
// and the earlier and later meetings = 29.
const MAIN_COUNT = 29;

/** The main fixture without the remote team call, and with the workshop moved to 10:00. */
const SECOND_FIXTURE = calendar([
  ...MAIN_EVENTS.filter((lines) => !lines.includes(`UID:${UID.remoteTeam}`) && !lines.includes(`UID:${UID.workshop}`)),
  vevent(UID.workshop, ["SUMMARY:Workshop", "DTSTART:20261106T100000Z", "DTEND:20261106T130000Z", "LAST-MODIFIED:20261121T080000Z"]),
]);

const primaryButtons = () => screen.queryAllByRole("button").filter((b) => b.className.includes("bg-primary text-primary-foreground"));

async function choose(text: string, name = "calendar.ics") {
  const input = screen.getByLabelText("Calendar file");
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File([text], name)] } });
  });
}

const setupPrincipal = (s: Seeder) => s.principal("PRINCIPAL-A");

async function renderScreen(seed: (s: Seeder) => void = setupPrincipal) {
  return renderApp({ seed, children: <ImportScreen /> });
}

async function applyMain(name = "calendar.ics") {
  await choose(MAIN_FIXTURE, name);
  fireEvent.click(screen.getByRole("button", { name: "Apply import" }));
}

describe("import screen", () => {
  test("choosing a file shows the review with the right counts", async () => {
    await renderScreen();
    expect(screen.getByText("For PRINCIPAL-A")).toBeTruthy();
    await choose(MAIN_FIXTURE);
    const review = await screen.findByRole("region", { name: "Review" });
    expect(within(review).getByText(
      `${MAIN_COUNT} added, 0 moved, 0 changed, 0 gone, 0 returned, 0 unchanged, 0 skipped as older, 1 private masked`,
    )).toBeTruthy();
    expect(within(review).getByText("calendar.ics: Thu 1 Oct to Mon 23 Nov")).toBeTruthy();
    expect(within(review).getAllByRole("row")).toHaveLength(MAIN_COUNT + 1);
  });

  test("the table stops at 50 rows and says how many more", async () => {
    await renderScreen();
    const many = Array.from({ length: 60 }, (_, i) =>
      vevent(`uid-${i}`, [`SUMMARY:Meeting ${i}`, `DTSTART:202611${String(1 + (i % 28)).padStart(2, "0")}T090000Z`, `DTEND:202611${String(1 + (i % 28)).padStart(2, "0")}T100000Z`]));
    await choose(calendar(many));
    expect(within(screen.getByRole("table", { name: "Changes" })).getAllByRole("row")).toHaveLength(51);
    expect(screen.getByText("and 10 more")).toBeTruthy();
  });

  test("applying writes the events and shows the delete reminder naming the file", async () => {
    const app = await renderScreen();
    await applyMain("diary-export.ics");
    expect(screen.getByText("Imported. Now delete diary-export.ics from your Downloads folder: it is not encrypted.")).toBeTruthy();
    expect(rows(app.device, "events")).toHaveLength(MAIN_COUNT);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("button", { name: "Choose .ics file" })).toBeTruthy();
  });

  test("importing the same file again says nothing to change and offers only Done", async () => {
    await renderScreen();
    await applyMain();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await choose(MAIN_FIXTURE);
    expect(screen.getByText("Nothing to change")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Apply import" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Choose .ics file" })).toBeTruthy();
  });

  test("a second file shows the gone event before the moved one, and marks the one with notes", async () => {
    const app = await renderScreen();
    await applyMain();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    const principal = rows(app.device, "principals")[0]!.id;
    app.seed.run(overlaySet, { now: NOW, event: idOf(app.device, "event", principal, UID.remoteTeam), notes: "Brief ready" });
    app.seed.task({ title: "Send papers", event: idOf(app.device, "event", principal, UID.workshop) });
    await choose(SECOND_FIXTURE);
    const table = screen.getByRole("table", { name: "Changes" });
    const [, gone, moved] = within(table).getAllByRole("row");
    expect(gone!.textContent).toContain("Gone · has notes");
    expect(gone!.textContent).toContain("Call with remote team");
    expect(moved!.textContent).toContain("Moved · 1 task");
    expect(moved!.textContent).toContain("Fri 6 Nov 13:00");
    expect(moved!.textContent).toContain("Fri 6 Nov 10:00");
  });

  test("cancel writes nothing and returns to choosing a file", async () => {
    const app = await renderScreen();
    await choose(MAIN_FIXTURE);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(rows(app.device, "events")).toHaveLength(0);
    expect(rows(app.device, "imports")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Choose .ics file" })).toBeTruthy();
  });

  test("a malformed file shows an error and no Apply button", async () => {
    await renderScreen();
    await choose("this is not a calendar");
    expect(screen.getByRole("alert").textContent).toMatch(/could not be read|no calendar/);
    expect(screen.queryByRole("button", { name: "Apply import" })).toBeNull();
  });

  test("exactly one primary button is present at each step", async () => {
    await renderScreen();
    expect(primaryButtons().map((b) => b.textContent)).toEqual(["Choose .ics file"]);
    await choose(MAIN_FIXTURE);
    expect(primaryButtons().map((b) => b.textContent)).toEqual(["Apply import"]);
    fireEvent.click(screen.getByRole("button", { name: "Apply import" }));
    expect(primaryButtons().map((b) => b.textContent)).toEqual(["Dismiss"]);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await choose(MAIN_FIXTURE);
    expect(primaryButtons().map((b) => b.textContent)).toEqual(["Done"]);
  });

  test("a viewer sees only the history", async () => {
    await renderScreen((s) => {
      s.principal("PRINCIPAL-A");
      s.viewer();
    });
    expect(screen.queryByLabelText("Calendar file")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "History" })).toBeTruthy();
  });

  test("history lists this principal's imports newest first", async () => {
    const app = await renderScreen((s) => {
      s.user("user-a", "Alex Example");
      s.principal("PRINCIPAL-A");
      s.principal("PRINCIPAL-B");
    });
    const idFor = (code: string) => rows(app.device, "principals").find((p) => p.code === code)!.id;
    const empty = { rangeStart: "2026-11-01T00:00:00.000Z", rangeEnd: "2026-11-30T00:00:00.000Z", changed: [], gone: [], returned: [], unchanged: 0, skippedOlder: 0, droppedPrivate: 0, maskedPrivate: 0 };
    const one = (uid: string) => [{ uid, recurrenceId: "", start: "2026-11-24T14:00:00.000Z", end: "2026-11-24T15:00:00.000Z", allDay: false, subject: "Meeting", location: "", organizer: "", categories: "", showAs: "busy", masked: false, sourceModified: "" }];
    expect(screen.getByText("For PRINCIPAL-A")).toBeTruthy();
    const [principalA, other] = [idFor("PRINCIPAL-A"), idFor("PRINCIPAL-B")];
    app.seed.run(importApply, { now: "2026-11-20T09:00:00.000Z", principal: principalA, file: "a.ics", diff: { ...empty, added: one("old") } });
    app.seed.run(importApply, { now: "2026-11-21T15:30:00.000Z", principal: principalA, file: "b.ics", diff: { ...empty, added: [...one("n1"), ...one("n2")] } });
    app.seed.run(importApply, { now: "2026-11-21T16:00:00.000Z", principal: other, file: "c.ics", diff: { ...empty, added: one("other") } });
    const body = within(screen.getByRole("table", { name: "Import history" })).getAllByRole("row").slice(1);
    expect(body.map((r) => within(r).getAllByRole("cell")[0]!.textContent)).toEqual(["Sat 21 Nov 15:30", "Fri 20 Nov 09:00"]);
    expect(within(body[0]!).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Sat 21 Nov 15:30", "Alex Example", "Sun 1 Nov to Mon 30 Nov", "2", "0", "0"]);
  });
});
