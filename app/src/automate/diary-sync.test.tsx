// Diary sync end to end in the app: with Power Automate on, a file in the
// inbox shows in Needs action, opens on the Import screen, is reviewed and
// applied, and its files are deleted. With it off, the inbox is never read.
import { afterEach, describe, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { AppFrame } from "@/app/app-frame";
import { AppProbe, cleanupApp, probe, renderApp, type Seeder } from "@/app/testing/render-app";
import { rows } from "@/domain/commands/testing/world";
import { MAIN_PAYLOAD } from "@/import/fixtures/diary-payload";
import { DIARY_INBOX } from "./diary-inbox";
import { diaryEvent } from "./testing/diary-event";
import { memoryPlainFiles } from "./testing/memory-plain-files";

afterEach(cleanupApp);

const A = `${DIARY_INBOX}/PRINCIPAL-A`;
const NEWEST = `${A}/20261123T210000Z.json`;
const OLDER = `${A}/20261123T203000Z.json`;

const inbox = () => memoryPlainFiles("automate", { [OLDER]: diaryEvent("2026-11-23T20:30:00Z"), [NEWEST]: diaryEvent("2026-11-23T21:00:00Z") });

function seed(automate: boolean) {
  return (s: Seeder) => {
    s.office({ name: "Test Office", timezone: "Europe/London", automate });
    s.principal("PRINCIPAL-A");
  };
}

async function openDiaryFromNeedsAction() {
  fireEvent.click(screen.getByRole("button", { name: "Needs action 1" }));
  const panel = await screen.findByRole("dialog");
  fireEvent.click(within(panel).getByRole("button", { name: /Diary update ready/ }));
}

describe("diary sync", () => {
  test("a diary update shows in Needs action, is reviewed on Import, applied, and its files deleted", async () => {
    const files = inbox();
    const app = await renderApp({ seed: seed(true), plainFiles: files, children: <><AppFrame /><AppProbe /></> });
    expect(screen.getByRole("button", { name: "Needs action 0" })).toBeTruthy();
    await app.tick();

    await openDiaryFromNeedsAction();
    expect(probe().screen).toBe("import");
    const notice = screen.getByRole("region", { name: "Diary update" });
    expect(notice.textContent).toContain("Power Automate read the diary at Mon 23 Nov 21:00");

    fireEvent.click(within(notice).getByRole("button", { name: "Review diary update" }));
    const review = await screen.findByRole("region", { name: "Review" });
    expect(within(review).getByText("23 added, 0 moved, 0 changed, 0 gone, 0 returned, 0 unchanged, 0 skipped as older, 1 private masked")).toBeTruthy();

    fireEvent.click(within(review).getByRole("button", { name: "Apply import" }));
    expect(await screen.findByText("Imported. The diary update's files have been deleted from the shared folder.")).toBeTruthy();
    expect(rows(app.device, "events").filter((e) => e.principal !== undefined)).toHaveLength(23);
    await app.tick();
    expect([...files.files.keys()]).toEqual([]);
    expect(screen.getByRole("button", { name: "Needs action 0" })).toBeTruthy();
  });

  test("an update with nothing to change is used up when dismissed", async () => {
    const files = inbox();
    const app = await renderApp({ seed: seed(true), plainFiles: files, children: <><AppFrame /><AppProbe /></> });
    await app.tick();
    await openDiaryFromNeedsAction();
    fireEvent.click(screen.getByRole("button", { name: "Review diary update" }));
    fireEvent.click(within(await screen.findByRole("region", { name: "Review" })).getByRole("button", { name: "Apply import" }));
    await app.tick();

    await files.write(`${A}/20261123T213000Z.json`, diaryEvent("2026-11-23T21:30:00Z"));
    await app.tick();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    fireEvent.click(await screen.findByRole("button", { name: "Review diary update" }));
    const review = await screen.findByRole("region", { name: "Review" });
    expect(within(review).getByText("Nothing to change")).toBeTruthy();
    fireEvent.click(within(review).getByRole("button", { name: "Done" }));
    await app.tick();
    expect([...files.files.keys()]).toEqual([]);
  });

  test("a payload the adapter refuses shows why, and nothing is applied", async () => {
    const files = memoryPlainFiles("automate", { [NEWEST]: diaryEvent("2026-11-23T21:00:00Z", { ...MAIN_PAYLOAD, count: 99 }) });
    const app = await renderApp({ seed: seed(true), plainFiles: files, children: <AppFrame /> });
    await app.tick();
    await openDiaryFromNeedsAction();
    fireEvent.click(screen.getByRole("button", { name: "Review diary update" }));
    expect((await screen.findByRole("alert")).textContent).toContain("may be cut off");
    expect(rows(app.device, "events")).toHaveLength(0);
    expect(files.files.has(NEWEST)).toBe(true);
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

  test("a viewer is not offered the update", async () => {
    const files = inbox();
    const app = await renderApp({ seed: (s) => { seed(true)(s); s.viewer(); }, plainFiles: files, children: <AppFrame /> });
    await app.tick();
    expect(screen.getByRole("button", { name: "Needs action 0" })).toBeTruthy();
  });
});
