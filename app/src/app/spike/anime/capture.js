// Builds entry.tsx into one page, plays each Anime.js demo on the real screens
// in headless Chromium, and writes, per demo and per motion setting:
//   <demo>[-reduced].gif   the cue as it plays (from a screen recording)
//   <demo>[-reduced]-strip.png   frames at fixed times after the cue starts
//   timing.json   rAF frame deltas: dropped frames at normal and 4x-slowed CPU
// node app/src/app/spike/anime/capture.js <out-dir>
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const { chromium } = createRequire(import.meta.url)("playwright");
const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const outDir = process.argv[2] ?? here("./out");
mkdirSync(outDir, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "anime-demo-"));
await build({
  configFile: false, logLevel: "error", root: here("."), plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": here("../../..") } },
  define: { "process.env.NODE_ENV": JSON.stringify("production"), __APP_VERSION__: JSON.stringify("0.0.0-spike"), __BUILT_AT__: JSON.stringify("2026-01-01T00:00:00.000Z") },
  build: { target: "es2022", outDir: work, emptyOutDir: true, rollupOptions: { input: here("./entry.tsx"), output: { format: "es", entryFileNames: "demo.js", codeSplitting: false } } },
});
process.stderr.write("built\n");
const code = readFileSync(join(work, "demo.js"), "utf8").replace(/<\/script/gi, "<\\/script");
const page = join(work, "demo.html");
writeFileSync(page, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Anime.js demos</title></head><body><div id="root"></div><script type="module">${code}</script></body></html>`);

// Each demo: where it plays, how to get there, what to crop, how long it runs, and when to sample frames (ms).
const ALL = [
  { name: "drag", query: "", screen: "Calendar", clip: { x: 260, y: 140, width: 1180, height: 760 }, ms: 1800, at: [0, 60, 300, 700, 1000, 1300, 1700] },
  { name: "arrive", query: "?as=user-b", screen: "Home", clip: { x: 260, y: 48, width: 1180, height: 600 }, ms: 2600, at: [0, 60, 120, 220, 600, 1400, 2400] },
  { name: "layer", query: "?proposal=1", screen: "Calendar", clip: { x: 260, y: 140, width: 1180, height: 760 }, ms: 700, at: [0, 80, 150, 220, 320, 450, 600] },
  { name: "count", query: "?as=user-b", screen: "Home", clip: { x: 270, y: 100, width: 420, height: 120 }, ms: 900, at: [0, 60, 130, 260, 400, 800] },
];
const only = process.argv[3]?.split(",");
const DEMOS = only ? ALL.filter((d) => only.includes(d.name)) : ALL;
const modes = process.argv[4] === "normal" ? [false] : [false, true];
const log = (...a) => process.stderr.write(a.join(" ") + "\n");

if (process.env.KEEP) writeFileSync(join(outDir, "demo.html"), readFileSync(page));
const browser = await chromium.launch();
const timingFile = join(outDir, "timing.json");
const timing = existsSync(timingFile) ? JSON.parse(readFileSync(timingFile, "utf8")) : {};
const errors = [];
for (const reduced of modes) {
  for (const demo of DEMOS) {
    const tag = `${demo.name}${reduced ? "-reduced" : ""}`;
    const videoDir = mkdtempSync(join(work, "video-"));
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference", recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } });
    const tab = await context.newPage();
    const opened = Date.now();
    tab.on("pageerror", (e) => errors.push(`${tag}: ${e}`));
    log(tag, "goto"); await tab.goto(pathToFileURL(page).href + demo.query); log(tag, "loaded");
    await tab.waitForTimeout(1200);
    await tab.getByRole("button", { name: demo.screen, exact: true }).first().click();
    await tab.waitForTimeout(900);
    log(tag, "ready");
    const runs = {};
    for (const cpu of [1, 4]) {
      // The first (normal speed) run is the one the GIF and strip are cut from.
      const cdp = await context.newCDPSession(tab);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
      if (cpu === 4) { await tab.reload(); await tab.waitForTimeout(1500); await tab.getByRole("button", { name: demo.screen, exact: true }).first().click(); await tab.waitForTimeout(1200); }
      const startedAt = await tab.evaluate(async ({ name, ms }) => {
        // Timelines are thenables, so the demos hand theirs back in a box.
        const { tl } = await window.demos[name]();
        window.clock(ms);
        tl.play();
        return Date.now();
      }, demo);
      log(tag, "cpu", cpu, "played");
      if (cpu === 1) runs.startedAt = startedAt;
      await tab.waitForTimeout(demo.ms + 300);
      const deltas = await tab.evaluate(() => [...window.frames]);
      const dropped = deltas.filter((d) => d > 25).length;
      const sorted = [...deltas].sort((a, b) => a - b);
      runs[`cpu${cpu}x`] = { frames: deltas.length, dropped, p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10, worst: Math.round(sorted.at(-1) * 10) / 10 };
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
    await context.close();
    const video = join(videoDir, readdirSync(videoDir)[0]);
    // A recording's start isn't exact, so the GIF is cut with a margin either side.
    runs.start = (runs.startedAt - opened) / 1000;
    delete runs.startedAt;
    timing[tag] = runs;
    const { x, y, width, height } = demo.clip;
    const crop = `crop=${width}:${height}:${x}:${y}`;
    // GIF of the cue, half a second before to half a second after.
    const from = Math.max(0, runs.start - 0.6);
    const scale = demo.name === "count" ? "scale=640:-1" : "scale=960:-1";
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(from), "-t", String(demo.ms / 1000 + 1.6), "-i", video, "-vf", `${crop},fps=25,${scale}:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse`, join(outDir, `${tag}.gif`)]);
    // Strip: the timeline is paused and seeked to each sample time, so the
    // frames are exact (a screen recording's clock isn't).
    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
    await still.goto(pathToFileURL(page).href + demo.query);
    await still.waitForTimeout(1200);
    await still.getByRole("button", { name: demo.screen, exact: true }).first().click();
    await still.waitForTimeout(900);
    await still.evaluate(async (name) => { window.cue = (await window.demos[name]()).tl; }, demo.name);
    const shots = [];
    for (const [i, ms] of demo.at.entries()) {
      await still.evaluate((t) => { window.cue.seek(t); }, ms); // seek returns the timeline, a thenable
      await still.waitForTimeout(60); // let React paint anything a callback changed
      const file = join(work, `${tag}-${i}.png`);
      await still.screenshot({ path: file, clip: demo.clip });
      execFileSync("convert", [file, "-resize", demo.name === "count" ? "320x" : "480x", file]);
      shots.push([file, `${ms} ms`]);
    }
    await still.close();
    execFileSync("montage", [...shots.flatMap(([f, l]) => ["-label", l, f]), "-tile", `${demo.name === "count" ? 6 : 4}x`, "-geometry", "+6+6", "-background", "#111", "-fill", "#ddd", "-pointsize", "14", join(outDir, `${tag}-strip.png`)]);
  }
}
await browser.close();
writeFileSync(join(outDir, "timing.json"), JSON.stringify(timing, null, 2));
rmSync(work, { recursive: true, force: true });
process.stdout.write(JSON.stringify(timing, null, 2) + "\n" + (errors.length ? `errors:\n${errors.join("\n")}\n` : "no page errors\n"));
