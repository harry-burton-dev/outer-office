// The host's per-tick hook (OUT-53): an app adds work that runs after each
// engine tick, one tick at a time, and a failing listener stops nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startHost } from "../host/host.ts";
import { installFakeBrowser, hostConfig } from "./helpers/fake-browser.js";

const APP = { id: "notes", name: "Notes", tables: { notes: { version: 1, fields: { title: "latest" } } } };

/** Starts the host with the interval captured, so the test drives each tick. */
async function startWithManualTicks() {
  const browser = installFakeBrowser();
  let tick;
  globalThis.window.setInterval = (fn) => {
    tick = fn;
    return 1;
  };
  globalThis.window.clearInterval = () => undefined;
  const host = await startHost(await hostConfig(APP));
  assert.equal(host.ok, true);
  const order = [];
  const engineTick = host.engine.tick.bind(host.engine);
  host.engine.tick = async () => {
    order.push("engine");
    await engineTick();
  };
  return { host, order, tick: () => tick(), restore: () => browser.restore() };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** Waits for the order to reach `length` entries; an engine tick can take a while on a slow runner. */
async function until(order, length) {
  for (let i = 0; order.length < length && i < 250; i++) await settle();
}

test("listeners run after the engine's tick, and stop when removed", async () => {
  const { host, order, tick, restore } = await startWithManualTicks();
  try {
    const remove = host.onTick(() => void order.push("app"));
    tick();
    await until(order, 2);
    assert.deepEqual(order, ["engine", "app"]);
    remove();
    tick();
    await until(order, 3);
    await settle();
    assert.deepEqual(order, ["engine", "app", "engine"]);
  } finally {
    await host.stop();
    restore();
  }
});

test("a slow listener holds the next tick back, and a failing one does not stop the others", async () => {
  const { host, order, tick, restore } = await startWithManualTicks();
  const logged = [];
  const realError = console.error;
  console.error = (...args) => void logged.push(args[0]);
  try {
    let release;
    host.onTick(() => {
      throw new Error("boom");
    });
    host.onTick(async () => {
      order.push("slow");
      await new Promise((resolve) => (release = resolve));
    });
    tick();
    await until(order, 2);
    tick(); // still inside the first tick: skipped
    await settle();
    assert.deepEqual(order, ["engine", "slow"]);
    release();
    await settle();
    tick();
    await until(order, 4);
    assert.deepEqual(order, ["engine", "slow", "engine", "slow"]);
    assert.equal(logged.length, 2);
    release();
  } finally {
    console.error = realError;
    await host.stop();
    restore();
  }
});
