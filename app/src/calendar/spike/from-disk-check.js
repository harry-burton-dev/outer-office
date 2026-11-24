// Spike check: does DiaryCalendar (FullCalendar 7, forma) work when built into
// one file and opened from disk? Builds spike-entry.tsx with the app's Vite
// plugins (React, Tailwind) into a single ES module, as the app build does,
// writes a page that carries it inline, opens that page from file:// in
// headless Chromium and checks:
//   - every synthetic weekday event title is visible in the week view
//   - nothing is draggable and clicking an event reports its id
//   - 09:00 London sits at the 09:00 line on both sides of the clock change
//     (Fri 23 Oct 2026, BST, and Mon 26 Oct 2026, GMT)
//   - no console errors, no page errors, no requests other than file://
// Saves calendar-from-disk.png next to this file.
//
//   npm install --no-save playwright && npx playwright install chromium
//   node app/src/calendar/spike/from-disk-check.js
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const { chromium } = createRequire(import.meta.url)("playwright");
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const SCREENSHOT = here("./calendar-from-disk.png");
const WEEKDAY_TITLES = ["Weekly review", "Team stand-up", "Budget planning", "Site visit", "Board briefing", "Lunch with partners", "Strategy session", "Press call", "Travel day", "Quarterly catch-up", "Morning check-in (GMT)"];

const failures = [];
const check = (ok, message) => {
  process.stdout.write(`${ok ? "ok  " : "FAIL"} ${message}\n`);
  if (!ok) failures.push(message);
};

async function buildPage(out) {
  await build({
    configFile: false,
    logLevel: "warn",
    root: here("."),
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": here("../..") } },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      target: "es2022",
      outDir: out,
      emptyOutDir: true,
      rollupOptions: { input: here("./spike-entry.tsx"), output: { format: "es", entryFileNames: "spike.js", codeSplitting: false } },
    },
  });
  const files = readdirSync(out, { recursive: true });
  check(files.length === 1 && files[0] === "spike.js", `built into one file (${files.join(", ")})`);
  const code = readFileSync(join(out, "spike.js"), "utf8").replace(/<\/script/gi, "<\\/script");
  const page = join(out, "calendar.html");
  writeFileSync(page, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Calendar spike</title></head><body><div id="root"></div><script type="module">${code}</script></body></html>`);
  return { page, bytes: Buffer.byteLength(code) };
}

/** Top of the event titled `title`, less the top of the "09:00" slot label, in the section `id`. */
function offsetFromNine(page, id, title) {
  return page.evaluate(({ id, title }) => {
    const section = document.getElementById(id);
    const leaves = [...section.querySelectorAll("*")].filter((el) => el.children.length === 0);
    const label = leaves.find((el) => el.textContent.trim() === "09:00");
    const event = leaves.find((el) => el.textContent.trim() === title);
    if (!label || !event) return null;
    return Math.round(event.getBoundingClientRect().top - label.getBoundingClientRect().top);
  }, { id, title });
}

async function main() {
  const out = mkdtempSync(join(tmpdir(), "calendar-spike-"));
  try {
    const { page: file, bytes } = await buildPage(out);
    process.stdout.write(`     page script ${bytes.toLocaleString("en-GB")} bytes\n`);
    const browser = await chromium.launch();
    // The browser runs in Tokyo, so London times can only be right if the calendar converts them itself.
    const page = await browser.newPage({ viewport: { width: 1280, height: 1800 }, timezoneId: "Asia/Tokyo" });
    const errors = [];
    const requests = [];
    page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(pathToFileURL(file).href);
    await page.getByText("Weekly review").first().waitFor({ timeout: 10_000 });

    const week = page.locator("#week");
    for (const title of WEEKDAY_TITLES) check(await week.getByText(title, { exact: true }).first().isVisible(), `week shows "${title}"`);
    check(await week.getByText("Weekend reading", { exact: true }).first().isVisible(), "week shows Saturday's event, so the weekend is not hidden");
    check((await page.locator("[draggable=true]").count()) === 0, "no element is draggable");

    await week.getByText("Budget planning", { exact: true }).click();
    check((await week.getAttribute("data-clicked")) === "e3", "clicking an event reports its id");

    const before = await offsetFromNine(page, "before-change", "Morning check-in (BST)");
    const after = await offsetFromNine(page, "week", "Morning check-in (GMT)");
    check(before !== null && before === after && Math.abs(before) < 20, `09:00 London on both sides of the clock change sits at the 09:00 line (offsets ${before}px and ${after}px)`);
    const timeOf = (id) => page.locator(`#${id}`).getByText(/^09:00 – 10:00$/).count();
    check((await timeOf("before-change")) === 1 && (await timeOf("week")) === 1, "both clock-change events are labelled 09:00 – 10:00");

    await page.screenshot({ path: SCREENSHOT, fullPage: true });
    check(errors.length === 0, `no console or page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
    const offDisk = requests.filter((url) => !url.startsWith("file:") && !url.startsWith("data:") && !url.startsWith("blob:"));
    check(offDisk.length === 0, `no network requests${offDisk.length ? `: ${offDisk.join(", ")}` : ""}`);
    await browser.close();
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  process.stdout.write(failures.length ? `${failures.length} check(s) failed\n` : "all checks passed\n");
  process.exitCode = failures.length ? 1 : 0;
}

await main();
