// Entry for diary-screenshot.js: the frame on the calendar screen, with a
// synthetic diary imported, at a laptop-sized window. Not part of the app bundle.
import { createRoot } from "react-dom/client";
import { DataProvider } from "@trellis/framework";
import css from "../../../index.css?inline";
import { ShellProvider } from "../../../../../framework/runtime/shell/provider";
import { SessionContext } from "../../../../../framework/runtime/shell/context";
import { fakeEngine } from "../../../../../framework/runtime/shell/test/helpers/fake-engine";
import { makeTestWorld, ok, NOW } from "../../../domain/commands/testing/world";
import { cardAdd, cardSet, importApply, officeSave, principalSave, proposalMove, proposalNew, tagSave, templateSave } from "../../../domain/commands";
import { toStored } from "../../import/import-model";
import { rows } from "../../../domain/commands/testing/world";
import { TAG_COLOURS } from "../../../domain/tags";
import { parseIcs } from "../../../import/parse-ics";
import { diffImport } from "../../../import/diff";
import { syntheticDiaries } from "../../../import/testing/synthetic-diaries";
import { AppProvider } from "../../../app/app-state";
import { AppFrame } from "../../../app/app-frame";

const style = document.createElement("style");
style.textContent = css;
document.head.append(style);

const world = await makeTestWorld();
const device = await world.device("user-a");
ok(device, officeSave, { now: NOW, name: "Synthetic Office", timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00", privatePolicy: "mask" });
const a = ok(device, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Chief Executive" });
const file = syntheticDiaries(new Date(NOW))[0];
const parsed = parseIcs(file.text, { timeZone: "Europe/London", privatePolicy: "mask", windowStart: "2000-01-01T00:00:00.000Z", windowEnd: "2100-01-01T00:00:00.000Z" });
ok(device, importApply, { now: NOW, principal: a, file: file.fileName, diff: diffImport([], parsed) });
// The update file: some meetings gone from Outlook, for the graveyard.
const update = syntheticDiaries(new Date(NOW))[1];
const window = { timeZone: "Europe/London", privatePolicy: "mask" as const, windowStart: "2000-01-01T00:00:00.000Z", windowEnd: "2100-01-01T00:00:00.000Z" };
ok(device, importApply, { now: NOW, principal: a, file: update.fileName, diff: diffImport(toStored(rows(device, "events"), a), parseIcs(update.text, window)) });
// One proposed move this week: the board meeting, an hour later.
const board = rows(device, "events").find((e) => e.subject === "Board meeting" && !e.gone && (e.start ?? "") > NOW);
// And one proposed new meeting on Wednesday afternoon.
const wednesday = new Date(Date.parse(NOW)); wednesday.setUTCDate(wednesday.getUTCDate() + ((3 - wednesday.getUTCDay() + 7) % 7));
const wed = wednesday.toISOString().slice(0, 10);
ok(device, proposalNew, { now: NOW, principal: a, subject: "Catch-up with the regulator", start: `${wed}T13:00:00.000Z`, end: `${wed}T14:00:00.000Z`, location: "Room 2.01", categories: "External" });
if (board?.start && board.end) ok(device, proposalMove, { now: NOW, event: board.id, start: new Date(Date.parse(board.start) + 3600_000).toISOString(), end: new Date(Date.parse(board.end) + 3600_000).toISOString() });
// Tags named after the synthetic diaries' Outlook categories, so they colour the diary.
const TAGS: [string, number][] = [["Ministerial", 0], ["Board", 6], ["External", 2], ["Stakeholder", 4], ["Internal", 9]];
if (!new URLSearchParams(location.search).has("notags")) for (const [name, c] of TAGS) ok(device, tagSave, { now: NOW, name, colour: TAG_COLOURS[c].value });
// Two card templates, POC and Dial-in, with cards on the first executive team meeting.
const poc = ok(device, templateSave, { now: NOW, name: "POC", shape: "user", fields: [
  { id: "name", label: "Point of contact", type: "text", required: true },
  { id: "phone", label: "Phone", type: "phone", required: true },
  { id: "role", label: "Role", type: "text" },
] });
const dial = ok(device, templateSave, { now: NOW, name: "Dial-in", shape: "phone", fields: [
  { id: "system", label: "System", type: "choice", required: true, options: "Teams bridge | 020 7946 0000, PIN 1234#\nZoom room | 020 7946 0001" },
  { id: "host", label: "Host dials", type: "check" },
] });
const exec = rows(device, "events").find((e) => e.subject === "Executive team" && !e.gone && (e.start ?? "") > NOW);
if (exec) {
  const c = ok(device, cardAdd, { now: NOW, event: exec.id, template: poc });
  ok(device, cardSet, { now: NOW, id: c, values: { name: "Avery Stone", phone: "07700 900123" } });
  ok(device, cardAdd, { now: NOW, event: exec.id, template: dial });
}
const session = { user: { id: "user-a", name: "User A" }, deviceId: "usera-1", folder: "Test", version: "0", builtAt: NOW, openInvite: () => undefined };

createRoot(document.getElementById("root")!).render(
  <ShellProvider engine={fakeEngine()}>
    <DataProvider data={device.data}>
      <SessionContext.Provider value={session}>
        <AppProvider>
          <AppFrame />
        </AppProvider>
      </SessionContext.Provider>
    </DataProvider>
  </ShellProvider>,
);
