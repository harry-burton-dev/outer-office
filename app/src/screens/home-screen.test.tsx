// Home (OUT-86): a stream per principal and For you, each with needs you then
// for information; Mark all seen, dismiss and the watching line.
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

/** A task user-b offered to user-a, as it arrives from user-b's device. */
const putOffer: CommandDef<{ title: string }, string> = {
  name: "test.putOffer",
  handler: (tx, { title }) => {
    const id = tx.newId();
    tx.put("tasks", id, { title, done: false, assignee: "user-a", assignedBy: "user-b", assignment: "offered", createdBy: "user-b" });
    return id;
  },
};

const lines = (name: string) => within(screen.getByRole("region", { name })).queryAllByTestId("update").map((li) => li.textContent ?? "");

function seedOffice(s: Seeder): string {
  s.user("user-b", "Blake");
  const principal = s.principal("PRINCIPAL-A", { title: "Minister" });
  s.run(putLog, { by: "user-b", principal, area: "calendar", kind: "added", event: "e-added", at: "2026-11-22T07:00:00.000Z" });
  s.run(putLog, { by: "user-b", principal, area: "calendar", kind: "moved", event: "e-moved", from: "2026-11-24T14:00:00Z", to: "2026-11-25T14:00:00Z", at: "2026-11-22T07:30:00.000Z" });
  s.run(putLog, { by: "user-a", principal, area: "calendar", kind: "added", event: "e-mine" });
  s.run(putOffer, { title: "Brief the visit" });
  return principal;
}

test("lists colleagues' changes by principal and tasks offered to you, not your own changes", async () => {
  await renderApp({ seed: (s) => void seedOffice(s), children: <HomeScreen /> });
  expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
  const diary = lines("PRINCIPAL-A · Minister");
  expect(diary).toHaveLength(2);
  expect(diary).toContainEqual(expect.stringMatching(/^Moved.*Tue 24 Nov 14:00 → Wed 25 Nov 14:00.*Blake/));
  expect(diary).toContainEqual(expect.stringMatching(/^Added/));
  expect(lines("For you")).toEqual([expect.stringMatching(/^Offered to you.*Brief the visit/)]);
  expect(within(screen.getByRole("region", { name: "PRINCIPAL-A · Minister" })).getByTestId("watching").textContent).toMatch(/^Watching PRINCIPAL-A's diary · \d+ rules on$/);
});

test("mark all seen clears that stream's for-information lane only; needs you stays", async () => {
  await renderApp({ seed: (s) => void seedOffice(s), children: <HomeScreen /> });
  const section = screen.getByRole("region", { name: "PRINCIPAL-A · Minister" });
  fireEvent.click(within(section).getByRole("button", { name: "Mark all seen" }));
  expect(lines("PRINCIPAL-A · Minister")).toEqual([]);
  expect(within(section).getByText("Nothing new.")).toBeTruthy();
  expect(lines("For you")).toHaveLength(1);
  expect(within(screen.getByRole("region", { name: "For you" })).queryByRole("button", { name: "Mark all seen" })).toBeNull();
});

test("dismiss hides one update; a needs-you update has no Dismiss", async () => {
  await renderApp({ seed: (s) => void seedOffice(s), children: <HomeScreen /> });
  const moved = within(screen.getByRole("region", { name: "PRINCIPAL-A · Minister" })).getAllByTestId("update").find((li) => li.textContent?.startsWith("Moved"))!;
  fireEvent.click(within(moved).getByRole("button", { name: "Dismiss" }));
  expect(lines("PRINCIPAL-A · Minister")).toEqual([expect.stringMatching(/^Added/)]);
  expect(within(screen.getByRole("region", { name: "For you" })).queryByRole("button", { name: "Dismiss" })).toBeNull();
});

test("says you are up to date when nothing changed", async () => {
  await renderApp({ seed: (s) => void s.principal("PRINCIPAL-A"), children: <HomeScreen /> });
  expect(screen.getByText("You're up to date")).toBeTruthy();
});
