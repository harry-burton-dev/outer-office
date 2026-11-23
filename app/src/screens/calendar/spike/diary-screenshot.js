// Builds diary-entry.tsx into one file and saves screenshots of the calendar screen.
// and saves frame.png next to this file.  node app/src/screens/calendar/spike/diary-screenshot.js [width height]
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
const out = mkdtempSync(join(tmpdir(), "diary-spike-"));
await build({
  configFile: false,
  logLevel: "error",
  root: here("."),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": here("../../..") } },
  define: { "process.env.NODE_ENV": JSON.stringify("production"), __APP_VERSION__: JSON.stringify("0.0.0-spike"), __BUILT_AT__: JSON.stringify("2026-01-01T00:00:00.000Z") },
  build: { target: "es2022", outDir: out, emptyOutDir: true, rollupOptions: { input: here("./diary-entry.tsx"), output: { format: "es", entryFileNames: "frame.js", codeSplitting: false } } },
});
const code = readFileSync(join(out, "frame.js"), "utf8").replace(/<\/script/gi, "<\/script");
const page = join(out, "frame.html");
writeFileSync(page, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Frame</title></head><body><div id="root"></div><script type="module">${code}</script></body></html>`);
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: Number(process.argv[2] ?? 1280), height: Number(process.argv[3] ?? 720) } });
const errors = [];
tab.on("pageerror", (e) => errors.push(String(e)));
tab.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await tab.goto(pathToFileURL(page).href);
await tab.locator("[data-diary-calendar]").waitFor();
await tab.waitForTimeout(500);
const scroll = await tab.evaluate(() => [...document.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 1 && ["auto", "scroll"].includes(getComputedStyle(e).overflowY)).map((e) => e.className.toString().slice(0, 60)));
process.stdout.write(`scrolling containers: ${JSON.stringify(scroll)}\n`);
await tab.screenshot({ path: process.env.OUT ?? here("./diary.png") });
if (process.env.RIGHT_CLICK) {
  await tab.getByText(process.env.RIGHT_CLICK).first().click({ button: "right" });
  await tab.waitForTimeout(400);
  process.stdout.write(`menus open: ${await tab.locator('[role="menu"]').count()}, triggers: ${await tab.locator('[data-slot="context-menu-trigger"]').count()}\n`);
  await tab.screenshot({ path: process.env.OUT_MENU ?? here("./diary-menu.png") });
  await tab.keyboard.press("Escape");
}
if (process.env.CLICK) {
  await tab.getByText(process.env.CLICK).first().click();
  await tab.waitForTimeout(500);
  await tab.screenshot({ path: process.env.OUT_PANEL ?? here("./diary-panel.png") });
}
await browser.close();
rmSync(out, { recursive: true, force: true });
process.stdout.write(errors.length ? `errors:\n${errors.join("\n")}\n` : "no page errors\n");
