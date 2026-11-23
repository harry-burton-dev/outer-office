// Entry for frame-screenshot.js: the frame on the in-memory world with
// synthetic data, styled by the app's stylesheet. Not part of the app bundle.
import { createRoot } from "react-dom/client";
import { DataProvider } from "@trellis/framework";
import css from "../../index.css?inline";
import { ShellProvider } from "../../../../framework/runtime/shell/provider";
import { SessionContext } from "../../../../framework/runtime/shell/context";
import { fakeEngine } from "../../../../framework/runtime/shell/test/helpers/fake-engine";
import { makeTestWorld, ok, NOW } from "../../domain/commands/testing/world";
import { officeSave, principalSave, projectSave, taskAdd } from "../../domain/commands";
import { AppProvider } from "../app-state";
import { AppFrame } from "../app-frame";

const style = document.createElement("style");
style.textContent = css;
document.head.append(style);

const world = await makeTestWorld();
const device = await world.device("user-a");
ok(device, officeSave, { now: NOW, name: "Synthetic Office", timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00", privatePolicy: "mask" });
const a = ok(device, principalSave, { now: NOW, code: "PRINCIPAL-A", title: "Principal A" });
ok(device, principalSave, { now: NOW, code: "PRINCIPAL-B", title: "Principal B" });
ok(device, projectSave, { now: NOW, name: "Office work" });
ok(device, taskAdd, { now: NOW, title: "Overdue", principal: a, due: "2020-01-01" });
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
