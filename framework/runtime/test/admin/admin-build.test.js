// The built admin page (OUT-10) with and without an app admin module: without
// one, neither the panels code nor the data runtime is built in; with one, the
// panels are, and the React shell that shares the public entry is not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { appConfig, adminPanelsPlugin } from "../../../build/vite.config.js";
import definition from "../../../build/app-definition.js";

const PANELS_CODE = "This section could not be shown";
const DATA_RUNTIME_CODE = "unknown command: ";
const REACT_CODE = /useSyncExternalStore|createRoot/;

async function buildAdmin(t, panelsFile) {
  const outDir = mkdtempSync(join(tmpdir(), "admin-build-"));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  const config = appConfig({ definition, version: "0.0.0", mode: "admin", outDir });
  const plugins = panelsFile ? config.plugins.map((p) => (p.name === "admin-panels" ? adminPanelsPlugin(panelsFile) : p)) : config.plugins;
  await build({ ...config, plugins, configFile: false, logLevel: "error" });
  return readFileSync(join(outDir, "admin.html"), "utf8");
}

test("with no app admin module, the page has no panels code and no data runtime", async (t) => {
  const html = await buildAdmin(t, fileURLToPath(new URL("./no-such-admin.ts", import.meta.url)));
  assert.ok(!html.includes(PANELS_CODE));
  assert.ok(!html.includes(DATA_RUNTIME_CODE));
  assert.doesNotMatch(html, REACT_CODE);
});

test("with a stand-in app admin module, the panels are built in without React", async (t) => {
  const html = await buildAdmin(t, fileURLToPath(new URL("./fixtures/admin-panels.ts", import.meta.url)));
  assert.ok(html.includes(PANELS_CODE));
  assert.ok(html.includes(DATA_RUNTIME_CODE));
  assert.ok(html.includes("stand-in panel drawn"));
  assert.doesNotMatch(html, REACT_CODE);
});
