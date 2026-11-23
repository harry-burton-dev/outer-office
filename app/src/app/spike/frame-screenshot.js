// Builds frame-entry.tsx into one file, opens it from disk in headless Chromium
// and saves frame.png next to this file.  node app/src/app/spike/frame-screenshot.js
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const { chromium } = createRequire(import.meta.url)("playwright");
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const out = mkdtempSync(join(tmpdir(), "frame-spike-"));
await build({
  configFile: false,
  logLevel: "error",
  root: here("."),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": here("../..") } },
  define: { "process.env.NODE_ENV": JSON.stringify("production"), __APP_VERSION__: JSON.stringify("0.0.0-spike"), __BUILT_AT__: JSON.stringify("2026-01-01T00:00:00.000Z") },
  build: { target: "es2022", outDir: out, emptyOutDir: true, rollupOptions: { input: here("./frame-entry.tsx"), output: { format: "es", entryFileNames: "frame.js", codeSplitting: false } } },
});
const code = readFileSync(join(out, "frame.js"), "utf8").replace(/<\/script/gi, "<\/script");
const page = join(out, "frame.html");
writeFileSync(page, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Frame</title></head><body><div id="root"></div><script type="module">${code}</script></body></html>`);
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
tab.on("pageerror", (e) => errors.push(String(e)));
tab.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await tab.goto(pathToFileURL(page).href);
await tab.getByRole("button", { name: /^Needs action/ }).waitFor();
await tab.screenshot({ path: here("./frame.png") });
await tab.getByRole("button", { name: /^Needs action/ }).click();
await tab.waitForTimeout(400);
await tab.screenshot({ path: here("./frame-panel.png") });
await browser.close();
rmSync(out, { recursive: true, force: true });
process.stdout.write(errors.length ? `errors:\n${errors.join("\n")}\n` : "no page errors\n");
