// <TrellisApp config strings?>{screens}</TrellisApp> (spec S4, Deliver 1): owns
// everything between opening the page and the app's screens, then shows the
// screens with the health indicator, inside the error boundary. An app can
// reword it (strings) and style it (its tokens), widen the running page
// (width), or lay out the running page itself (chrome="app"); the first-run
// screens stay the shell's.
import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { createData } from "../../data/runtime";
import { DataProvider } from "../../react/hooks";
import type { AppDefinition } from "../definition";
import type { HostStart } from "../host/host";
import { appNames } from "../names";
import { ConflictPrompt } from "./conflict-prompt";
import { SessionContext, useShell, type TrellisSession } from "./context";
import { AlreadyOpen, Failed, FolderStep, folderEvent, InviteForm, Message, PassportStep, UnlockStep, describeError, type Flow } from "./first-run";
import { HealthIndicator } from "./health-indicator";
import { reduce, type ShellEvent, type ShellState, type Started } from "./machine";
import { ShellProvider } from "./provider";
import { realServices, type ShellServices } from "./services";
import { mergeStrings, type ShellStringOverrides, type ShellStrings } from "./strings";
import { Button } from "./ui/button";

const DEV_PRIVATE_FOLDER_HASH = "#private-folder";

export interface TrellisAppProps {
  config: AppDefinition;
  /** Rewords any of the shell's text; the rest stays as in defaultStrings. */
  strings?: ShellStringOverrides;
  /** "wide" removes the page-width cap once the app is running. First-run screens stay narrow. */
  width?: "narrow" | "wide";
  /**
   * "app": once running, the app lays out the whole page and places the shell's
   * pieces itself (HealthIndicator, ConflictPrompt, useSession). First-run
   * screens are unchanged. width is then ignored.
   */
  chrome?: "shell" | "app";
  /** The app's screens, shown once the engine is running. */
  children?: ReactNode;
  /** For tests: stand-ins for the side effects. */
  services?: ShellServices;
}

const booting = new WeakMap<ShellServices, Promise<ShellEvent>>();

/**
 * Start-up runs once per page, however many times React mounts the component
 * (development mode mounts twice). Running it twice would create two device
 * ids and two engines writing to the same folder.
 */
function boot(services: ShellServices, config: AppDefinition, strings: ShellStrings): Promise<ShellEvent> {
  let started = booting.get(services);
  if (!started) {
    started = (async (): Promise<ShellEvent> => {
      let db;
      try {
        db = await services.openDb(appNames(config).database);
      } catch (error: unknown) {
        return { type: "failed", message: strings.storageUnavailable, detail: describeError(error, strings) };
      }
      try {
        const dev = import.meta.env.DEV && location.hash === DEV_PRIVATE_FOLDER_HASH;
        return await folderEvent(services, db, dev ? await services.privateFolder(config.id) : await services.loadFolder(db));
      } catch (error: unknown) {
        return { type: "failed", message: describeError(error, strings) };
      }
    })();
    booting.set(services, started);
  }
  return started;
}

/**
 * The data runtime for a started engine, made here rather than in a component
 * body so React mounting twice cannot make two. Stopping closes it first.
 */
function withData(started: Extract<HostStart, { ok: true }>, config: AppDefinition, user: string): Started {
  const { engine, deviceId, clock, random } = started;
  const data = createData({ engine, config, deviceId, user, clock, random });
  return {
    ...started,
    data,
    stop: async () => {
      data.close();
      await started.stop();
    },
  };
}

// Whole literals: Tailwind only generates classes it can find written out in the source.
const NARROW = "mx-auto flex max-w-3xl flex-col gap-4 p-6";
const WIDE = "mx-auto flex max-w-none flex-col gap-4 p-6";
const APP_CHROME = "flex flex-col";

function pageClass(phase: ShellState["phase"], width: TrellisAppProps["width"], chrome: TrellisAppProps["chrome"]): string {
  if (phase !== "running") return NARROW;
  if (chrome === "app") return APP_CHROME;
  return width === "wide" ? WIDE : NARROW;
}

export function TrellisApp({ config, strings, width = "narrow", chrome = "shell", children, services = realServices }: TrellisAppProps) {
  const [state, dispatch] = useReducer(reduce, { phase: "starting" } as ShellState);
  const merged = useMemo(() => mergeStrings(strings), [strings]);

  useEffect(() => {
    let cancelled = false;
    void boot(services, config, merged).then((event) => !cancelled && dispatch(event));
    return () => {
      cancelled = true;
    };
  }, [services, config, merged]);

  const start = useCallback(
    async (db: Parameters<Flow["start"]>[0], root: FileSystemDirectoryHandle, identity: Parameters<Flow["start"]>[2]): Promise<void> => {
      const result = await services.startHost({ root, db, user: identity.user.id, key: identity.key, keyId: identity.keyId, keys: identity.keys, app: config });
      if (result.ok) void services.loader()?.checkForUpdate(root);
      dispatch({ type: "started", identity, result: result.ok ? withData(result, config, identity.user.id) : result });
    },
    [services, config],
  );
  const flow = useMemo<Flow>(() => ({ config, services, dispatch, start }), [config, services, start]);
  const engine = state.phase === "running" ? state.session.engine : undefined;

  return (
    <ShellProvider engine={engine} strings={strings} onUpdate={engine && services.loader()?.onUpdate}>
      <main id="app-shell" aria-label={config.name} className={pageClass(state.phase, width, chrome)}>
        {state.phase === "starting" && (
          <p id="loading" role="status" className="text-sm">
            {merged.starting}
          </p>
        )}
        {state.phase === "folder" && <FolderStep state={state} flow={flow} />}
        {state.phase === "passport" && <PassportStep state={state} flow={flow} />}
        {state.phase === "unlock" && <UnlockStep key={state.passport.handle.name} state={state} flow={flow} />}
        {state.phase === "already-open" && <AlreadyOpen state={state} flow={flow} />}
        {state.phase === "failed" && <Failed state={state} />}
        {state.phase === "running" && (
          <Running state={state} flow={flow} chrome={chrome}>
            {children}
          </Running>
        )}
        {!(chrome === "app" && state.phase === "running") && <p className="text-xs text-muted-foreground">{merged.version(__APP_VERSION__, __BUILT_AT__)}</p>}
      </main>
    </ShellProvider>
  );
}

type RunningState = Extract<ShellState, { phase: "running" }>;

interface RunningProps {
  state: RunningState;
  flow: Flow;
  chrome: NonNullable<TrellisAppProps["chrome"]>;
  children?: ReactNode;
}

function Running({ state, flow, chrome, children }: RunningProps) {
  const { strings } = useShell();
  const { db, root, session } = state;
  const { engine } = session;
  const [inviting, setInviting] = useState(false);
  const info = useMemo<TrellisSession>(
    () => ({ user: session.user, deviceId: session.deviceId, folder: root.name, version: __APP_VERSION__, builtAt: __BUILT_AT__, openInvite: () => setInviting(true) }),
    [session.user, session.deviceId, root.name],
  );

  // Permission lost mid-session: the engine reports the folder disconnected;
  // the banner appears only when the browser no longer grants access.
  useEffect(() => {
    let live = true;
    const check = async (): Promise<void> => {
      const disconnected = engine.health().state === "folder-disconnected";
      const permission = disconnected ? await flow.services.folderPermission(root) : "granted";
      if (live) flow.dispatch({ type: "health", disconnected, permission });
    };
    const stop = engine.on("health", () => void check());
    void check();
    return () => {
      live = false;
      stop();
    };
  }, [engine, root, flow]);

  /** After a key rotation: enrol from the new invite, then restart the engine with the new keys. */
  const replaced = async (identity: Parameters<Flow["start"]>[2]): Promise<void> => {
    await session.stop();
    await flow.start(db, root, identity);
  };

  const banner = state.reconnect !== "none" && <ReconnectBanner state={state} flow={flow} />;
  const inviteForm = <InviteForm db={db} root={root} flow={flow} onDone={replaced} onCancel={() => setInviting(false)} />;

  if (chrome === "app") {
    return (
      <DataProvider data={session.data}>
        <SessionContext.Provider value={info}>
          {banner}
          {inviting && inviteForm}
          {children}
        </SessionContext.Provider>
      </DataProvider>
    );
  }

  return (
    <DataProvider data={session.data}>
      <SessionContext.Provider value={info}>
        <HealthIndicator />
        <ConflictPrompt />
        {banner}
        {children}
        {inviting ? (
          inviteForm
        ) : (
          <Button id="new-invite" variant="outline" className="self-start" onClick={() => setInviting(true)}>
            {strings.newInvite}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">{strings.signedIn(session.user.name, session.deviceId, root.name)}</p>
      </SessionContext.Provider>
    </DataProvider>
  );
}

function ReconnectBanner({ state, flow }: { state: RunningState; flow: Flow }) {
  const { strings } = useShell();
  const reconnect = async (): Promise<void> => {
    // Called straight from the click, so the browser may show its prompt.
    const next = await flow.services.regrant(state.root);
    const granted = next.status === "ready";
    flow.dispatch({ type: "regranted", granted, message: granted ? undefined : strings.folderRefused });
    if (granted) void state.session.engine.scan();
  };
  return (
    <section id="reconnect" aria-label={strings.reconnectTitle} className="flex flex-col items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p>{strings.reconnectBanner(state.root.name)}</p>
      {state.reconnect === "needed" ? (
        <Button size="sm" onClick={() => void reconnect()}>
          {strings.reconnect}
        </Button>
      ) : (
        <p>{strings.reconnected}</p>
      )}
      <Message text={state.message} />
    </section>
  );
}
