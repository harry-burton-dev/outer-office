// The app's sections on the admin page: how they are found at build time,
// drawn, contained when they throw, and saved after a change. Written before the code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { panelSections, savingData, openPanels } from "../../admin/panels.ts";
import { makeDataWorld, notesApp } from "../../../data/test/_world.js";
import { adminPanelsPlugin } from "../../../build/vite.config.js";
import definition from "../../../build/app-definition.js";

const { document } = new JSDOM("<!doctype html><main></main>").window;
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

/** A data runtime stand-in: run() returns `result` and counts its calls. */
function fakeData(result = { ok: true, value: "x", changes: [{ op: "put", table: "t", id: "1", fields: {} }] }) {
  const runs = [];
  return { runs, data: { tables: [], view: () => undefined, conflicts: undefined, commandLog: () => [], close: () => undefined, run: (command, input) => (runs.push([command, input]), result) } };
}

function deps(data, overrides = {}) {
  const said = [];
  const flushes = [];
  return { said, flushes, deps: { data, user: "admin", el, flush: async () => void flushes.push(1), say: (text) => said.push(text), ...overrides } };
}

test("the build gives no panels when the app has no admin module, and the app's module when it has one", () => {
  const missing = adminPanelsPlugin(join(fileURLToPath(new URL(".", import.meta.url)), "no-such-admin.ts"));
  assert.equal(missing.resolveId("./something-else"), undefined);
  assert.equal(missing.load(missing.resolveId("virtual:admin-panels")), "export const panels = null;");

  const here = fileURLToPath(import.meta.url);
  const found = adminPanelsPlugin(here);
  const code = found.load(found.resolveId("virtual:admin-panels"));
  assert.ok(code.includes(`import { adminPanels } from ${JSON.stringify(here.replace(/\\/g, "/"))};`), code);
  assert.match(code, /import \{ openPanels \} from ".*\/runtime\/admin\/panels\.ts";/);
  assert.match(code, /export const panels = openPanels\(adminPanels\);/);
});

test("no panels: no sections", () => {
  assert.deepEqual(panelSections([], deps(fakeData().data).deps), []);
});

test("one panel: a section with its heading and what it drew, and refresh draws it again", () => {
  let draws = 0;
  let refresh;
  const panel = { title: "Setup", render: (ctx) => { draws++; refresh = ctx.refresh; assert.equal(ctx.user, "admin"); return [ctx.el("p", {}, `drawn ${draws}`), ctx.el("button", {}, "Save")]; } };
  const [section, ...rest] = panelSections([panel], deps(fakeData().data).deps);
  assert.equal(rest.length, 0);
  assert.equal(section.querySelector("h2").textContent, "Setup");
  assert.equal(section.querySelector("p").textContent, "drawn 1");
  assert.ok(section.querySelector("button"));
  refresh();
  assert.equal(section.querySelector("p").textContent, "drawn 2");
  assert.equal(section.querySelectorAll("p").length, 1, "the old drawing is replaced, not added to");
});

test("a panel that throws shows an error line in its own section, and the others still draw", () => {
  const broken = { title: "Broken", render: () => { throw new Error("no office yet"); } };
  const fine = { title: "Fine", render: (ctx) => ctx.el("p", {}, "all well") };
  const [first, second] = panelSections([broken, fine], deps(fakeData().data).deps);
  assert.equal(first.querySelector("h2").textContent, "Broken");
  assert.match(first.textContent, /could not be shown: no office yet/);
  assert.equal(second.querySelector("p").textContent, "all well");
});

test("a panel that throws on refresh keeps its section and shows the error", () => {
  let fail = false;
  let refresh;
  const panel = { title: "Flaky", render: (ctx) => { refresh = ctx.refresh; if (fail) throw new Error("later"); return ctx.el("p", {}, "ok"); } };
  const [section] = panelSections([panel], deps(fakeData().data).deps);
  fail = true;
  assert.doesNotThrow(() => refresh());
  assert.match(section.textContent, /could not be shown: later/);
});

test("a command that changes something is flushed to the folder; a failed or empty one is not", async () => {
  const changed = fakeData();
  const a = deps(changed.data);
  const data = savingData(a.deps.data, a.deps.flush, a.deps.say);
  assert.equal(data.run("thing.save", { n: 1 }).ok, true);
  assert.deepEqual(changed.runs, [["thing.save", { n: 1 }]]);
  await Promise.resolve();
  assert.equal(a.flushes.length, 1);

  for (const result of [{ ok: false, code: "failed", error: "no" }, { ok: true, value: 1, changes: [] }]) {
    const b = deps(fakeData(result).data);
    savingData(b.deps.data, b.deps.flush, b.deps.say).run("thing.save", {});
    await Promise.resolve();
    assert.equal(b.flushes.length, 0, JSON.stringify(result));
  }
});

test("a panel's data saves through the page's flush, and a failed save is reported", async () => {
  const c = deps(fakeData().data, { flush: async () => { throw new Error("folder gone"); } });
  const panel = { title: "Writes", render: (ctx) => (ctx.data.run("thing.save", {}), ctx.el("p")) };
  panelSections([panel], c.deps);
  await new Promise((done) => setTimeout(done, 0));
  assert.deepEqual(c.said, ["The change could not be saved to the folder: folder gone"]);
});

test("the admin page's own code names none of the app's tables", () => {
  const dir = fileURLToPath(new URL("../../admin/", import.meta.url));
  const source = readdirSync(dir).map((file) => readFileSync(join(dir, file), "utf8")).join("\n");
  for (const table of Object.keys(definition.tables)) assert.doesNotMatch(source, new RegExp(`["'\`]${table}["'\`]`), table);
});

test("openPanels runs the app's data runtime on the session's engine, writes as the admin and saves to the folder", async () => {
  const world = await makeDataWorld(notesApp);
  const engine = await world.device("admin-aaaaaaaa");
  let flushed = 0;
  const host = {
    engine: Object.assign(Object.create(engine), { flush: async () => void (flushed++, await engine.flush()) }),
    config: notesApp, deviceId: "admin-aaaaaaaa", user: "admin", clock: world.clock, random: world.random, el, say: (text) => assert.fail(text),
  };
  const panel = {
    title: "Notes",
    render: (ctx) => {
      const add = ctx.el("button", {}, "Add");
      add.addEventListener("click", () => {
        assert.equal(ctx.data.run("records.create", { table: "notes", id: "n1", fields: { title: "Hello" } }).ok, true);
        ctx.refresh();
      });
      return [ctx.el("p", {}, `${ctx.data.view("notes").rows().length} notes`), add];
    },
  };
  const open = openPanels([panel])(host);
  const [section] = open.sections();
  assert.equal(section.querySelector("p").textContent, "0 notes");
  section.querySelector("button").click();
  assert.equal(section.querySelector("p").textContent, "1 notes");
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(flushed, 1);
  open.close();
});

test("openPanels: a data runtime that cannot open shows the error in each section instead of stopping the page", () => {
  const host = { engine: { table: () => { throw new Error("table unreadable"); }, flush: async () => undefined }, config: notesApp, deviceId: "admin-aaaaaaaa", user: "admin", clock: { now: () => 1 }, random: { bytes: (n) => new Uint8Array(n) }, el, say: () => undefined };
  const open = openPanels([{ title: "A", render: () => assert.fail("not drawn") }, { title: "B", render: () => assert.fail("not drawn") }])(host);
  const sections = open.sections();
  assert.deepEqual(sections.map((s) => s.querySelector("h2").textContent), ["A", "B"]);
  for (const s of sections) assert.match(s.textContent, /could not be shown: table unreadable/);
  assert.doesNotThrow(() => open.close());
});
