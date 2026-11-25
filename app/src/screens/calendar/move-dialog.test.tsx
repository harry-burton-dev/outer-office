// The Move dialog's Find a time (OUT-85): the next three free slots, one click
// fills the day and time, and Propose makes the proposal at that slot.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { proposalMove } from "@/domain/commands";
import { Dialog } from "@/components/ui/dialog";
import { cleanupApp, renderApp, type RenderedApp } from "@/app/testing/render-app";
import { MoveDialog } from "./move-dialog";
import { eventIdOf, importEvents, MONDAY_NOW, syntheticEvent } from "./testing/events";

afterEach(cleanupApp);

const proposals = (app: RenderedApp) =>
  (app.device.data.view("proposals").rows() as unknown as Array<{ _deleted?: boolean; event?: string; start?: string }>).filter((p) => !p._deleted);

async function dialog() {
  let id = "";
  const app = await renderApp({
    now: MONDAY_NOW,
    seed: (s) => {
      const a = s.principal("PRINCIPAL-A");
      importEvents(s, MONDAY_NOW, a, [
        syntheticEvent("a1", { subject: "Budget review", start: "2026-11-24T14:00:00Z", end: "2026-11-24T15:00:00Z" }),
        syntheticEvent("a3", { subject: "Late meeting", start: "2026-11-23T17:15:00Z", end: "2026-11-23T18:00:00Z" }),
      ]);
      id = eventIdOf(s.device, a, "a1");
      // A proposal elsewhere counts as busy: Late meeting proposed to Tuesday 08:00.
      s.run(proposalMove, { now: MONDAY_NOW, event: eventIdOf(s.device, a, "a3"), start: "2026-11-24T08:00:00Z", end: "2026-11-24T09:00:00Z" });
    },
    children: (
      <Dialog open>
        <MoveDialogFor />
      </Dialog>
    ),
  });
  return { app, id };

  function MoveDialogFor() {
    return <MoveDialog target={{ id, title: "Budget review", start: "2026-11-24T14:00:00Z", end: "2026-11-24T15:00:00Z" }} timeZone="Europe/London" onDone={() => {}} />;
  }
}

test("Find a time offers the next three free slots, and a chosen one is what Propose proposes", async () => {
  const { app, id } = await dialog();
  fireEvent.click(screen.getByRole("button", { name: "Find a time" }));
  const offered = Array.from(screen.getByRole("group", { name: "Free times" }).querySelectorAll("button")).map((b) => b.textContent);
  // It starts on Tuesday, the meeting's own day; 08:00 is taken by the proposal.
  expect(offered).toEqual(["Tue 24 Nov, 09:00 to 10:00", "Tue 24 Nov, 09:15 to 10:15", "Tue 24 Nov, 09:30 to 10:30"]);
  fireEvent.click(screen.getByRole("button", { name: "Tue 24 Nov, 09:00 to 10:00" }));
  expect((screen.getByLabelText("Starts") as HTMLInputElement).value).toBe("09:00");
  expect((screen.getByLabelText("Day") as HTMLInputElement).value).toBe("2026-11-24");
  fireEvent.click(screen.getByRole("button", { name: "Propose" }));
  expect(proposals(app).find((p) => p.event === id)).toMatchObject({ start: "2026-11-24T09:00:00.000Z" });
});
