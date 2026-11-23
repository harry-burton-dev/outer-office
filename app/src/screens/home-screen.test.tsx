// Home: colleagues' changes grouped by principal, tasks offered to you, mark as seen, watch rules.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { CommandDef } from "@trellis/framework";
import { cleanupApp, renderApp, type Seeder } from "@/app/testing/render-app";
import { HomeScreen } from "./home-screen";

afterEach(cleanupApp);

const EARLIER = "2026-11-22T08:00:00.000Z";

interface LogSeed { by: string; principal: string; area: string; kind: string; event?: string; task?: string; from?: string; to?: string; note?: string; at?: string }

/** Writes a log row as another user would have, so Home has colleagues' changes to show. */
const putLog: CommandDef<LogSeed, string> = {
  name: "test.putLog",
  handler: (tx, { at = EARLIER, ...row }) => {
    const id = tx.newId();
    tx.put("log", id, { at, event: "", task: "", from: "", to: "", note: "", ...row });
    return id;
  },
};

const lines = (name: string) => within(screen.getByRole("region", { name })).queryAllByTestId("home-change").map((li) => li.textContent ?? "");

function seedOffice(s: Seeder): string {
  s.user("user-b", "Blake");
  const principal = s.principal("PRINCIPAL-A", { title: "Minister" });
  s.run(putLog, { by: "user-b", principal, area: "calendar", kind: "added", note: "" });
  s.run(putLog, { by: "user-b", principal, area: "calendar", kind: "moved", from: "2026-11-24T14:00:00Z", to: "2026-11-25T14:00:00Z" });
  s.run(putLog, { by: "user-b", principal, area: "import", kind: "applied", note: "diary.ics: 1 added" });
  s.run(putLog, { by: "user-a", principal, area: "calendar", kind: "gone" });
  s.run(putLog, { by: "user-b", principal: "", area: "task", kind: "assigned", to: "user-a" });
  return principal;
}

test("lists colleagues' changes by principal and tasks offered to you, not your own changes or imports", async () => {
  await renderApp({ seed: (s) => void seedOffice(s), children: <HomeScreen /> });
  expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
  const diary = lines("PRINCIPAL-A · Minister");
  expect(diary).toHaveLength(2);
  expect(diary[0]).toMatch(/^Added/);
  expect(diary[1]).toMatch(/^Moved.*Tue 24 Nov 14:00 → Wed 25 Nov 14:00.*Blake/);
  expect(lines("Tasks for you")).toHaveLength(1);
});

test("mark as seen clears that section only", async () => {
  await renderApp({ seed: (s) => void seedOffice(s), children: <HomeScreen /> });
  const section = screen.getByRole("region", { name: "PRINCIPAL-A · Minister" });
  fireEvent.click(within(section).getByRole("button", { name: "Mark as seen" }));
  expect(lines("PRINCIPAL-A · Minister")).toEqual([]);
  expect(within(section).getByText(/Nothing new since/)).toBeTruthy();
  expect(lines("Tasks for you")).toHaveLength(1);
});

test("turning a watch rule off hides its changes", async () => {
  await renderApp({ seed: (s) => void seedOffice(s), children: <HomeScreen /> });
  fireEvent.click(screen.getByRole("button", { name: "Watch rules" }));
  fireEvent.click(screen.getByRole("switch", { name: "A meeting moves" }));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(await screen.findAllByTestId("home-change")).toHaveLength(2);
  expect(lines("PRINCIPAL-A · Minister")).toHaveLength(1);
});

test("says you are up to date when nothing changed", async () => {
  await renderApp({ seed: (s) => void s.principal("PRINCIPAL-A"), children: <HomeScreen /> });
  expect(screen.getByText("You're up to date")).toBeTruthy();
});
