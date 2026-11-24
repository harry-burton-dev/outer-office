// The Automate page end to end (OUT-91): every file the app reads leaves a run
// record, an unchanged one too, and the page shows each principal's state,
// what the app did, and the setup guide.
import { afterEach, describe, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { AppFrame } from "@/app/app-frame";
import { cleanupApp, renderApp, type Seeder } from "@/app/testing/render-app";
import { rows } from "@/domain/commands/testing/world";
import { DIARY_INBOX } from "./diary-inbox";
import { ago } from "./automate-screen";
import { graphFile } from "./testing/graph-file";
import { memoryPlainFiles } from "./testing/memory-plain-files";

afterEach(cleanupApp);

const A = `${DIARY_INBOX}/PRINCIPAL-A`;
const FIRST = `${A}/20261019T210000Z.json`;

function seed(automate: boolean) {
  return (s: Seeder) => {
    s.office({ name: "Test Office", timezone: "Europe/London", automate });
    s.principal("PRINCIPAL-A");
    s.principal("PRINCIPAL-B");
  };
}

const openAutomate = () => fireEvent.click(screen.getByRole("button", { name: "Automate" }));
const rowOf = (code: string) => screen.getByRole("row", { name: new RegExp(`^${code}`) });

describe("the Automate page", () => {
  test("records each run, an unchanged one too, and shows it per principal", async () => {
    const files = memoryPlainFiles("automate", { [FIRST]: graphFile() });
    const app = await renderApp({ seed: seed(true), plainFiles: files, children: <AppFrame /> });
    await app.tick();
    expect(rows(app.device, "flowRuns")).toEqual([expect.objectContaining({ principal: "PRINCIPAL-A", outcome: "applied", added: 23, fileAt: "2026-10-19T21:00:00Z" })]);
    await files.write(`${A}/20261019T213000Z.json`, graphFile());
    await app.tick();
    await app.tick();
    expect(rows(app.device, "flowRuns")).toEqual([expect.objectContaining({ outcome: "unchanged", fileAt: "2026-10-19T21:30:00Z" })]);

    openAutomate();
    expect(screen.getByRole("heading", { level: 1, name: "Automate" })).toBeTruthy();
    const a = rowOf("PRINCIPAL-A");
    expect(within(a).getByText("Late")).toBeTruthy();
    expect(a.textContent).toContain("No changes");
    expect(a.textContent).toContain("automate/inbox/diary-sync/PRINCIPAL-A");
    expect(within(rowOf("PRINCIPAL-B")).getByText("No file yet")).toBeTruthy();
  });

  test("a refused file shows its reason", async () => {
    const files = memoryPlainFiles("automate", { [FIRST]: JSON.stringify({ error: { code: "ErrorAccessDenied", message: "Access is denied." } }) });
    const app = await renderApp({ seed: seed(true), plainFiles: files, children: <AppFrame /> });
    await app.tick();
    expect(rows(app.device, "flowRuns")[0]).toMatchObject({ outcome: "refused", file: "20261019T210000Z.json" });
    openAutomate();
    const a = rowOf("PRINCIPAL-A");
    expect(within(a).getByText("Can't be used")).toBeTruthy();
    expect(a.textContent).toContain("Access is denied");
  });

  test("with the setting off it says so and reads nothing", async () => {
    const files = memoryPlainFiles("automate", { [FIRST]: graphFile() });
    const app = await renderApp({ seed: seed(false), plainFiles: files, children: <AppFrame /> });
    await app.tick();
    openAutomate();
    expect(screen.getByRole("status").textContent).toContain("Power Automate is off");
    expect(within(rowOf("PRINCIPAL-A")).getByText("Off")).toBeTruthy();
    expect(files.reads).toBe(0);
  });

  test("the setup guide renders in the app with a copy button on each code block", async () => {
    await renderApp({ seed: seed(true), plainFiles: memoryPlainFiles("automate", {}), children: <AppFrame /> });
    openAutomate();
    fireEvent.click(screen.getByRole("tab", { name: "Set up" }));
    expect(await screen.findByRole("heading", { level: 3, name: "Set up the diary sync in Power Automate" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Copy" }).length).toBeGreaterThan(3);
    expect(screen.getByRole("link", { name: "make.powerautomate.com" }).getAttribute("target")).toBe("_blank");
  });
});

test("ages read in minutes, hours, then days", () => {
  const now = "2026-11-24T12:00:00.000Z";
  expect(ago("2026-11-24T11:59:30.000Z", now)).toBe("just now");
  expect(ago("2026-11-24T11:48:00.000Z", now)).toBe("12 min ago");
  expect(ago("2026-11-24T09:00:00.000Z", now)).toBe("3 h ago");
  expect(ago("2026-11-21T12:00:00.000Z", now)).toBe("3 days ago");
});
