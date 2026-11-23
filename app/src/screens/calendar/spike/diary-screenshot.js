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
if (process.env.PROBE_RIGHT_CLICK) {
  // Right-click each meeting near its bottom-right corner, away from the text, and count the menus that open.
  const blocks = await tab.locator("[data-event-face]").evaluateAll((faces) => faces.map((f) => { let e = f; for (let i = 0; i < 6 && e.parentElement; i++) { e = e.parentElement; if (["A","BUTTON"].includes(e.tagName) || e.getAttribute("role") === "button") break; } e.setAttribute("data-probe", ""); return e.tagName + "." + e.className.toString().slice(0, 80); }));
  process.stdout.write(`event element: ${blocks[0]}\n`);
  const blocks2 = await tab.locator("[data-probe]").all();
  let opened = 0;
  for (const block of blocks2) {
    const box = await block.boundingBox();
    if (!box) continue;
    await tab.mouse.click(box.x + box.width - 3, box.y + box.height - 3, { button: "right" });
    if (await tab.locator("[data-slot=context-menu-content]").count()) opened += 1;
    await tab.keyboard.press("Escape");
    await tab.waitForTimeout(50);
  }
  process.stdout.write(`right-click opened a menu on ${opened} of ${blocks2.length} meetings\n`);
}
if (process.env.LENS) {
  // LENS="Place/Location": open the lens menu, pick the tab and the lens, and save the menu and the diary.
  const [category, name] = process.env.LENS.split("/");
  await tab.getByRole("button", { name: "Lens" }).click();
  await tab.getByRole("tab", { name: category }).click();
  await tab.screenshot({ path: process.env.OUT_MENU ?? here("./diary-lens-menu.png") });
  await tab.getByRole("menuitemradio", { name: new RegExp(`^${name}`) }).click();
  await tab.keyboard.press("Escape");
  await tab.waitForTimeout(200);
  await tab.screenshot({ path: process.env.OUT_LENS ?? here("./diary-lens.png") });
}
if (process.env.LAYER) {
  // LAYER="up" or "down" (or "down,down"): step through the layers and save each.
  for (const [i, step] of process.env.LAYER.split(",").entries()) {
    await tab.getByRole("button", { name: step === "up" ? /^Up/ : /^Down/ }).click();
    await tab.waitForTimeout(200);
    await tab.screenshot({ path: `${process.env.OUT_DIR ?? here(".")}/diary-layer-${i}-${step}.png` });
  }
}
if (process.env.MOVE) {
  // MOVE="Investor call/16:00": right-click the meeting, propose it at that time, and save the dialog and the result.
  const [title, time] = process.env.MOVE.split("/");
  await tab.getByText(title).first().click({ button: "right" });
  await tab.getByRole("menuitem", { name: "Move…" }).click();
  await tab.getByLabel("Starts").fill(time);
  await tab.screenshot({ path: `${process.env.OUT_DIR ?? here(".")}/diary-move-dialog.png` });
  await tab.getByRole("button", { name: "Propose" }).click();
  await tab.waitForTimeout(200);
  await tab.screenshot({ path: `${process.env.OUT_DIR ?? here(".")}/diary-move-done.png` });
}
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
