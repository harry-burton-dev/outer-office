// A simulated shared folder with the app on one device and the flow on another.
import { createWorld } from "../../engine/src/sim/world.js";
import { createAutomateClient } from "../client.js";
import { createFakeOrchestrator } from "../testing/fake-orchestrator.js";
import { diaryFetchStub } from "../testing/conformance.js";

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;

export function sequentialIds(prefix = "a") {
  let n = 0;
  return () => `${prefix.repeat(8)}-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

export async function automateDir(device) {
  return device.root.getDirectoryHandle("automate", { create: true });
}

export async function setup({ seed = "automate", faults = {}, apis, idPrefix = "a" } = {}) {
  const world = createWorld({ seed, faults });
  const app = world.addDevice("app-aaaaaaaa");
  const flow = world.addDevice("flow-ffffffff");
  const now = () => world.clock.now();
  const client = createAutomateClient({
    dir: await automateDir(app),
    caller: { user: "sam", app: "outer-office test" },
    now,
    newId: sequentialIds(idPrefix),
  });
  const orchestrator = createFakeOrchestrator({
    dir: await automateDir(flow),
    now,
    apis: apis ?? { "diary.fetch@1": diaryFetchStub() },
    handledFor: "flow@office.example",
  });
  return { world, app, flow, now, client, orchestrator };
}

/**
 * Runs the world for `ms`: the client ticks every 30 s and the flow sweeps
 * every 2 minutes (both only if given). Errors from a tick or sweep are
 * counted, as a failed run would be, and the next one tries again.
 */
export async function run(world, ms, { client, orchestrator, onTick } = {}) {
  const outcomes = { settled: [], timedOut: [], errors: 0 };
  for (let t = 0; t < ms; t += 30 * SECOND) {
    await world.advance(30 * SECOND);
    if (orchestrator && (t + 30 * SECOND) % (2 * MINUTE) === 0) {
      try {
        await orchestrator.sweep();
      } catch {
        outcomes.errors += 1;
      }
    }
    if (client) {
      try {
        const { settled, timedOut } = await client.tick();
        outcomes.settled.push(...settled);
        outcomes.timedOut.push(...timedOut);
        onTick?.(settled, timedOut);
      } catch {
        outcomes.errors += 1;
      }
    }
  }
  return outcomes;
}

const decoder = new TextDecoder();

/** Files under automate/<sub>/ as the cloud has them: name -> text. */
export function cloudFolder(world, sub) {
  const prefix = `automate/${sub}/`;
  const out = {};
  for (const [path, bytes] of world.cloudFiles()) {
    if (path.startsWith(prefix)) out[path.slice(prefix.length)] = decoder.decode(bytes);
  }
  return out;
}

export async function writeText(dir, sub, name, text) {
  const folder = await dir.getDirectoryHandle(sub, { create: true });
  const handle = await folder.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}
