// Test harness (not shipped: the `testing` folder is exempt from the boundary
// check and shipped code may not import it). Renders app components with real
// data on the framework's in-memory world, seeded by running real commands.
//
// API
//   renderApp(options?) -> Promise<RenderedApp>
//     options.user      the signed-in user id (default "user-a")
//     options.name      the signed-in user's name (default "User A")
//     options.now       the fixed clock, ISO UTC (default NOW, 2026-11-22T09:00Z);
//                       only Date is faked, timers stay real
//     options.seed      (seed: Seeder) => void, run before the first render
//     options.children  what to render inside <AppProvider> (default <AppFrame />);
//                       pass a screen or panel to test it alone, plus <AppProbe /> to read state
//   RenderedApp: Testing Library's RenderResult plus
//     device            the user's Device (data runtime on the memory world)
//     seed              the same Seeder, to change data after the first render;
//                       its writes are wrapped in act()
//   Seeder: run(command, input) runs any command and returns its value (throws on failure);
//     office(fields), principal(code, fields?) -> id, task(input) -> id, viewer(userId?), ackPrivacy(),
//     user(id, name, active?) writes a users-table record (the framework's table, read by useUsers)
//   AppProbe: renders useApp()'s screen, panel, principalId and quickAddOpen as data-* attributes
//     on an element with data-testid="app-probe"; read them with probe().
//   cleanupApp(): call in afterEach (unmounts and restores the real clock).
//
// Usage
//   afterEach(cleanupApp);
//   test("shows the inbox", async () => {
//     await renderApp({ seed: (s) => s.principal("PRINCIPAL-A"), children: <><TaskListScreen list="inbox" /><AppProbe /></> });
//     expect(screen.getByRole("heading", { name: "Inbox" })).toBeTruthy();
//   });
import type { ReactNode } from "react";
import { act, cleanup, render, screen, type RenderResult } from "@testing-library/react";
import { vi } from "vitest";
import { DataProvider, type CommandDef } from "@trellis/framework";
import { ShellProvider } from "../../../../framework/runtime/shell/provider";
import { SessionContext, type TrellisSession } from "../../../../framework/runtime/shell/context";
import { fakeEngine } from "../../../../framework/runtime/shell/test/helpers/fake-engine";
import { makeTestWorld, ok, NOW, type Device, type SeedUser } from "../../domain/commands/testing/world";
import { ackPrivacy, officeSave, principalSave, setMode, taskAdd, type OfficeSaveInput, type PrincipalSaveInput, type TaskAddInput } from "../../domain/commands";
import { AppProvider, useApp } from "../app-state";
import { AppFrame } from "../app-frame";

export { NOW };

export interface Seeder {
  readonly device: Device;
  run<I, V>(command: CommandDef<I, V>, input: I): V;
  office(fields: Omit<OfficeSaveInput, "now">): void;
  /** Creates an active principal (title defaults to "Principal <code>") and returns its id. */
  principal(code: string, fields?: Omit<PrincipalSaveInput, "now" | "code" | "id">): string;
  task(input: Omit<TaskAddInput, "now">): string;
  /** Sets people.mode to viewer for the user (default: the signed-in one). */
  viewer(userId?: string): void;
  ackPrivacy(): void;
  /** Writes a record in the framework's users table, as the admin page would (active unless said otherwise). */
  user(id: string, name: string, active?: boolean): void;
}

export interface RenderAppOptions {
  user?: string;
  name?: string;
  now?: string;
  seed?: (seed: Seeder) => void;
  children?: ReactNode;
}

export interface RenderedApp extends RenderResult {
  readonly device: Device;
  readonly seed: Seeder;
}

function makeSeeder(device: Device, now: string, wrap: (write: () => void) => void): Seeder {
  const run = <I, V>(command: CommandDef<I, V>, input: I): V => {
    let value: V | undefined;
    wrap(() => {
      value = ok(device, command, input);
    });
    return value as V;
  };
  return {
    device,
    run,
    office: (fields) => void run(officeSave, { now, ...fields }),
    principal: (code, fields = {}) => run(principalSave, { now, code, title: `Principal ${code}`, ...fields }),
    task: (input) => run(taskAdd, { now, ...input }),
    viewer: (userId = device.user) => void run(setMode, { now, userId, mode: "viewer" }),
    ackPrivacy: () => void run(ackPrivacy, { now }),
    user: (id, name, active = true) => wrap(() => device.putUser({ id, name, active } satisfies SeedUser)),
  };
}

function installDomStubs(): void {
  if (typeof window.matchMedia !== "function") {
    const matchMedia = (query: string): MediaQueryList =>
      ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList;
    Object.defineProperty(window, "matchMedia", { value: matchMedia, configurable: true });
  }
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}

export async function renderApp(options: RenderAppOptions = {}): Promise<RenderedApp> {
  const { user = "user-a", name = "User A", now = NOW, children = <AppFrame /> } = options;
  installDomStubs();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  const world = await makeTestWorld();
  const device = await world.device(user);
  options.seed?.(makeSeeder(device, now, (write) => write()));
  const session: TrellisSession = { user: { id: user, name }, deviceId: `${user}-device`, folder: "Test folder", version: "0.0.0-test", builtAt: now, openInvite: () => undefined };
  const result = render(
    <ShellProvider engine={fakeEngine()}>
      <DataProvider data={device.data}>
        <SessionContext.Provider value={session}>
          <AppProvider>{children}</AppProvider>
        </SessionContext.Provider>
      </DataProvider>
    </ShellProvider>,
  );
  return { ...result, device, seed: makeSeeder(device, now, (write) => act(write)) };
}

export function cleanupApp(): void {
  cleanup();
  vi.useRealTimers();
}

/** Shows the app state for assertions; render it next to the component under test. */
export function AppProbe() {
  const app = useApp();
  return (
    <output
      data-testid="app-probe"
      data-screen={app.screen}
      data-panel={app.panel ? JSON.stringify(app.panel) : ""}
      data-principal={app.principalId ?? ""}
      data-quick-add={String(app.quickAddOpen)}
    />
  );
}

export interface ProbeState {
  screen: string;
  panel: string;
  principalId: string;
  quickAddOpen: boolean;
}

export function probe(): ProbeState {
  const el = screen.getByTestId("app-probe");
  return { screen: el.dataset.screen ?? "", panel: el.dataset.panel ?? "", principalId: el.dataset.principal ?? "", quickAddOpen: el.dataset.quickAdd === "true" };
}
