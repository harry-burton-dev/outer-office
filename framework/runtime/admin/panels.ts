// The app's own sections on the admin page. An app may provide
// app/src/admin/index.ts exporting `adminPanels`. The build's
// "virtual:admin-panels" (framework/build/vite.config.js) then gives the page
// openPanels(adminPanels); without that file it gives null, and neither this
// file nor the data runtime is built into the page. The page shows each panel
// once a workspace is open, under its own heading. This file knows no app
// table, field or command: a panel reads and writes through the data runtime it is given.
import type { AppDefinition } from "../definition.ts";
import type { CommandDef, CommandResult } from "../../data/commands.ts";
import type { EngineLike } from "../../data/registry.ts";
import type { ConflictSink } from "../../data/conflicts.ts";
import { createData, type Data } from "../../data/runtime.ts";

/** The admin page's DOM helper: makes an element, sets its properties and appends its children. */
export type AdminElement = <K extends keyof HTMLElementTagNameMap>(tag: K, props?: Partial<HTMLElementTagNameMap[K]> & { id?: string }, ...children: (Node | string)[]) => HTMLElementTagNameMap[K];

export interface AdminPanelContext {
  /** The app's data runtime for this admin session. A command that changes something is saved to the folder straight away. */
  readonly data: Data;
  /** The user the admin page writes as. */
  readonly user: string;
  /** The admin page's DOM helper, so a panel looks like the rest of the page. */
  readonly el: AdminElement;
  /** Draws this panel again, after a change. */
  refresh(): void;
}

export interface AdminPanel {
  /** The section's heading. */
  readonly title: string;
  render(ctx: AdminPanelContext): Node | readonly Node[];
}

export interface PanelDeps {
  readonly data: Data;
  readonly user: string;
  readonly el: AdminElement;
  /** Writes pending changes to the folder (the engine's flush). */
  flush(): Promise<void>;
  /** Shows a message on the page, for a save that failed after a panel's command. */
  say(text: string): void;
}

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** `data`, with run() flushing to the folder after any run that changed something. */
export function savingData(data: Data, flush: () => Promise<void>, say: (text: string) => void): Data {
  const run = <I, V>(command: string | CommandDef<I, V>, input: I): CommandResult<V> => {
    const result = data.run(command, input);
    if (result.ok && result.changes.length > 0) flush().catch((error: unknown) => say(`The change could not be saved to the folder: ${describe(error)}`));
    return result;
  };
  return { ...data, run };
}

/** One section per panel. A panel that throws shows an error line in its own section; the others are unaffected. */
export function panelSections(panels: readonly AdminPanel[], deps: PanelDeps): HTMLElement[] {
  const { el } = deps;
  const data = savingData(deps.data, deps.flush, deps.say);
  return panels.map((panel) => {
    const body = el("div");
    const draw = (): void => {
      try {
        const drawn = panel.render({ data, user: deps.user, el, refresh: draw });
        body.replaceChildren(...(Array.isArray(drawn) ? drawn : [drawn as Node]));
      } catch (error) {
        body.replaceChildren(el("p", { className: "note" }, `This section could not be shown: ${describe(error)}`));
      }
    };
    draw();
    return el("section", { className: "admin-panel" }, el("h2", {}, panel.title), body);
  });
}

/** What the admin page gives the panels for one open workspace. */
export interface PanelHost {
  readonly engine: EngineLike & ConflictSink & { flush(): Promise<void> };
  readonly config: AppDefinition;
  readonly deviceId: string;
  readonly user: string;
  readonly clock: { now(): number };
  readonly random: { bytes(n: number): Uint8Array };
  readonly el: AdminElement;
  say(text: string): void;
}

/** The panels for one session: their sections, and close() for when the session stops. */
export interface OpenPanels {
  sections(): HTMLElement[];
  close(): void;
}

export type PanelOpener = (host: PanelHost) => OpenPanels;

/**
 * Opens the app's data runtime on the session's engine and draws the panels
 * with it. If the runtime cannot open, each panel's section says why and the rest of the page works.
 */
export function openPanels(panels: readonly AdminPanel[]): PanelOpener {
  return (host) => {
    const { engine, config, deviceId, user, clock, random, el, say } = host;
    let data: Data;
    try {
      data = createData({ engine, config, deviceId, user, clock, random });
    } catch (error) {
      const failed = (panel: AdminPanel): HTMLElement => el("section", { className: "admin-panel" }, el("h2", {}, panel.title), el("p", { className: "note" }, `This section could not be shown: ${describe(error)}`));
      return { sections: () => panels.map(failed), close: () => undefined };
    }
    return { sections: () => panelSections(panels, { data, user, el, flush: () => engine.flush(), say }), close: () => data.close() };
  };
}
