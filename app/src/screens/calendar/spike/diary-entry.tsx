// Entry for diary-screenshot.js: the frame on the calendar screen, with a
// synthetic diary imported, at a laptop-sized window. Not part of the app bundle.
import { createRoot } from "react-dom/client";
import { DataProvider } from "@trellis/framework";
import css from "../../../index.css?inline";
import { ShellProvider } from "../../../../../framework/runtime/shell/provider";
import { SessionContext } from "../../../../../framework/runtime/shell/context";
import { fakeEngine } from "../../../../../framework/runtime/shell/test/helpers/fake-engine";
import { makeTestWorld, ok, NOW } from "../../../domain/commands/testing/world";
import { importApply, officeSave, principalSave } from "../../../domain/commands";
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
