// Anime.js demos on OO2's real screens (OUT-90). Not part of the app bundle:
// capture.js builds this file on its own, opens it in headless Chromium and
// calls window.demos.* to play each cue on the real DOM.
//
// Each demo is a cue layer only. The app's data and screens are real (seeded
// through the real commands); the demos animate what React renders. Wiring a
// cue into the app proper would move it into the component that owns it.
import { createRoot } from "react-dom/client";
import { DataProvider } from "@trellis/framework";
import { animate, createTimeline, createLayout, utils, waapi, type Timeline } from "animejs";
import css from "../../../index.css?inline";
import { ShellProvider } from "../../../../../framework/runtime/shell/provider";
import { SessionContext } from "../../../../../framework/runtime/shell/context";
import { fakeEngine } from "../../../../../framework/runtime/shell/test/helpers/fake-engine";
import { ok } from "../../../domain/commands/testing/world";
import { importApply, proposalMove, taskAdd } from "../../../domain/commands";
import { AppProvider } from "../../app-state";
import { AppFrame } from "../../app-frame";
import { diff, ev, makeOffice, WEEK } from "./world";

const params = new URLSearchParams(location.search);
// Home hides your own changes, so the Home demo signs in as a colleague.
const userId = params.get("as") ?? "user-a";
localStorage.setItem("theme", "dark");
const style = document.createElement("style");
style.textContent = css;
document.head.append(style);

const { device, principal } = await makeOffice();
const LATER = "2026-11-24T22:00:00.000Z";
const eventId = (uid: string) => (device.data.view("events").rows() as unknown as { id: string; uid: string }[]).find((e) => e.uid === uid)!.id;
if (params.get("proposal")) ok(device, proposalMove, { now: LATER, event: eventId("a5"), start: "2026-11-25T15:15:00Z", end: "2026-11-25T16:15:00Z" });

// One switch for reduced motion: movement and scale go, short fades stay.
// (createScope({ mediaQueries }) only fills scope.matches inside scope.add();
// the first reduced-motion capture caught that, so these demos ask matchMedia.)
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const move = (px: number) => (reduce() ? 0 : px);

// Motion tokens, matching the notes (§1).
const T = { fast: 100, base: 150, settle: 220, layer: 320 };
const EASE_OUT = "outQuint";
const EASE_IN = "inQuad";

const $ = <E extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as E | null;
const byText = (sel: string, text: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((n) => n.textContent?.includes(text)) ?? null;
/** The filled block an event is drawn as: the first ancestor of its face with a background. */
function eventBox(subject: string): HTMLElement {
  let el = byText("[data-event-face]", subject)!;
  while (el.parentElement && getComputedStyle(el).backgroundColor === "rgba(0, 0, 0, 0)") el = el.parentElement;
  return el;
}
const overlay = (css: Partial<CSSStyleDeclaration>, html = "") => {
  const d = document.createElement("div");
  Object.assign(d.style, { position: "fixed", pointerEvents: "none", zIndex: "60", ...css });
  d.innerHTML = html;
  document.body.append(d);
  return d;
};
const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** 1. Drag to propose: lift, ghost, snap chip, clash hatch, settle into a proposal, undo toast. */
function drag(): { tl: Timeline } {
  const src = eventBox("Board prep");
  const target = eventBox("Recruitment panel");
  const a = src.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const hour = a.height; // Board prep is one hour long.
  const mirror = src.cloneNode(true) as HTMLElement;
  Object.assign(mirror.style, { position: "fixed", left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: "0", zIndex: "61", transformOrigin: "50% 40%", borderRadius: "6px" });
  document.body.append(mirror);
  const chip = overlay({ left: `${a.left}px`, top: `${a.top - 26}px`, background: "#ececec", color: "#111", font: "600 11px/1 system-ui", padding: "5px 9px", borderRadius: "999px", opacity: "0", whiteSpace: "nowrap" });
  const hatch = overlay({ left: `${b.left - 4}px`, top: `${b.top}px`, width: `${b.width + 8}px`, height: `${b.height}px`, opacity: "0", borderTop: "1px solid #f0b45a88", borderBottom: "1px solid #f0b45a88", background: "repeating-linear-gradient(135deg,#f0b45a26 0 6px,transparent 6px 12px)" });
  const toast = overlay({ right: "24px", bottom: "24px", background: "#2f2f2f", color: "#ececec", font: "500 13px system-ui", padding: "12px 14px", borderRadius: "12px", boxShadow: "0 8px 28px #0009", opacity: "0", display: "flex", gap: "16px" }, "<span>Proposed Board prep for Wed 15:15</span><b style='text-decoration:underline'>Undo</b>");
  const dx = b.left + b.width * 0.45 - a.left;
  const dy = b.top + hour / 4 - a.top;
  const startMin = 10 * 60;
  const clashAt = 0.78; // share of the travel at which the block is over Wed 15:00
  const tl = createTimeline({ autoplay: false, defaults: { ease: EASE_OUT } });
  tl
    // Pick up: the original becomes the dashed ghost, the mirror lifts.
    .add(src, { opacity: [1, 0.5], outlineColor: ["#0000", "#5a5a5a"], outlineStyle: "dashed", outlineWidth: "1.5px", duration: T.fast }, 0)
    .add(mirror, { scale: [1, move(0.03) + 1], rotate: [0, move(-0.4)], boxShadow: ["0 0 0 0 #0000", "0 12px 30px 0 #000c"], duration: 120 }, 0)
    .add(chip, { opacity: [0, 1], duration: T.fast }, 60)
    // Travel: x glides, y snaps to 15-minute rows like FullCalendar's mirror does.
    .add(mirror, {
      // Reduced motion: the block lands on the new time at once instead of travelling.
      x: dx, y: dy, duration: reduce() ? 0 : 900, ease: "inOutQuad",
      modifier: utils.snap(1),
      onUpdate: (anim) => {
        const p = anim.progress;
        const travelled = Math.round((dy * p) / (hour / 4)) * 15;
        const day = p < 0.5 ? "Tue" : "Wed";
        const s = startMin + travelled + (p > 0.5 ? 0 : 0);
        chip.textContent = `${day} ${hhmm(s)}–${hhmm(s + 60)}${p >= clashAt ? " · clashes" : ""}`;
        chip.style.transform = `translate(${dx * p}px, ${dy * p}px)`;
        if (reduce()) chip.textContent = `Wed 15:15–16:15 · clashes`;
      },
    }, 140)
    .add(hatch, { opacity: [0, 1], duration: 80, ease: "linear" }, 140 + 900 * clashAt)
    // Drop: settle into the proposal style, then the undo toast.
    .add(mirror, { scale: 1, rotate: 0, boxShadow: "0 0 0 0 #0000", duration: 180 }, 1250)
    // Colours go through waapi: Tailwind 4 colours are oklab/oklch, which Anime.js's
    // JS engine can't interpolate (it reads hex, rgb and hsl only); the browser can.
    .call(() => { mirror.style.outline = "1.5px dashed #9cc7e6"; waapi.animate(mirror, { backgroundColor: [getComputedStyle(mirror).backgroundColor, "#26313a"], outlineColor: ["#9cc7e600", "#9cc7e6"], duration: 180, ease: "out(3)" }); }, 1250)
    .add([chip, hatch], { opacity: 0, duration: T.base, ease: EASE_IN }, 1250)
    .add(toast, { opacity: [0, 1], y: [move(12), 0], duration: T.settle }, 1400);
  return { tl };
}

/** 2. Updates arriving on Home: a sync lands, rows enter and close up with createLayout. */
async function arrive(): Promise<{ tl: Timeline }> {
  const root = $("main") ?? document.body;
  const layout = createLayout(root, { children: "li[data-testid='home-change']", duration: T.settle, ease: EASE_OUT });
  layout.record();
  const before = new Set([...root.querySelectorAll("li[data-testid='home-change']")]);
  const press = WEEK.find((e) => e.uid === "a10")!;
  const stored = (e: typeof press) => ({ ...e, id: eventId(e.uid), principal, gone: false, moves: 0 });
  ok(device, importApply, {
    now: LATER, principal, file: "graph-sync",
    diff: diff({
      added: [ev("b1", "2026-11-30", "10:00", "11:00", "Audit committee"), ev("b2", "2026-12-01", "14:00", "15:00", "Donor briefing")],
      changed: [{ before: stored(press), after: { ...press, start: "2026-11-26T14:00:00Z", end: "2026-11-26T15:30:00Z", sourceModified: "2026-11-24T21:00:00Z" }, fields: ["start", "end"], moved: true }],
    }),
  });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const fresh = [...root.querySelectorAll<HTMLElement>("li[data-testid='home-change']")].filter((n) => !before.has(n));
  // Rows already there glide to their new place together; only the new rows stagger in.
  // Reduced motion: rows jump to their new place; new rows still fade in, without the drop.
  const tl = layout.animate({ autoplay: false, duration: reduce() ? 0 : T.settle, enterFrom: { opacity: 0, y: move(-10), duration: T.settle, delay: (_el: unknown, i = 0) => 60 + i * 50 } });
  // The pale blue wash that marks what's new, fading over two seconds.
  fresh.forEach((n) => (n.style.backgroundImage = "linear-gradient(90deg,#ddf2ff2e,#ddf2ff00 70%)"));
  tl.add(fresh, { backgroundColor: ["#ddf2ff14", "#ddf2ff00"], duration: 2000, ease: "linear", onComplete: () => fresh.forEach((n) => (n.style.backgroundImage = "")) }, T.settle);
  return { tl };
}

/** 3. Layer switch: up to Proposed slides the diary down-and-in from above; the switch itself is the real button. */
function layer(): { tl: Timeline } {
  // FullCalendar's grid (its role="table"), not the toolbar, so the switch itself stays still.
  const grid = $("[role='table'][aria-label]")!;
  const up = $<HTMLButtonElement>("[data-layer-switch] button[aria-label^='Up to']")!;
  const tl = createTimeline({ autoplay: false });
  tl.add(grid, { opacity: [1, 0], y: [0, move(12)], duration: T.base, ease: EASE_IN })
    .call(() => up.click(), T.base)
    .add(grid, { opacity: [0, 1], y: [move(-12), 0], duration: T.layer - T.base + 100, ease: EASE_OUT }, T.base + 20);
  return { tl };
}

/** 4. A count rolls to its new value when new work lands: Home's change count for the principal. */
async function count(): Promise<{ tl: Timeline }> {
  const badge = document.querySelector<HTMLElement>("section h2 span.text-muted-foreground")!;
  const from = Number(badge.textContent);
  ok(device, importApply, { now: LATER, principal, file: "graph-sync", diff: diff({ added: [ev("c1", "2026-12-02", "09:00", "10:00", "Finance huddle"), ev("c2", "2026-12-02", "11:00", "12:00", "Site visit")] }) });
  // Wait for React to show the new count (it renders on its own schedule).
  for (let i = 0; i < 60 && Number(badge.textContent) === from; i++) await new Promise((r) => setTimeout(r, 16));
  const to = Number(badge.textContent);
  (window as unknown as { lastCount: unknown }).lastCount = { from, to };
  const r = badge.getBoundingClientRect();
  const roll = overlay({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, overflow: "hidden", background: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(badge).color, font: getComputedStyle(badge).font, textAlign: "center" },
    `<div style="display:flex;flex-direction:column"><span style="height:${r.height}px;line-height:${r.height}px">${from}</span><span style="height:${r.height}px;line-height:${r.height}px">${to}</span></div>`);
  const col = roll.firstElementChild as HTMLElement;
  const tl = createTimeline({ autoplay: false });
  tl.add(col, { y: [0, -r.height], duration: reduce() ? 0 : 260, ease: EASE_OUT }, 0)
    .call(() => waapi.animate(roll, { color: ["#ddf2ff", getComputedStyle(badge).color], duration: 900, ease: "out(2)" }), 0)
    .call(() => roll.remove(), 950);
  return { tl };
}

// A frame clock: every rAF delta while a demo plays, for the dropped-frame count.
const frames: number[] = [];
function clock(ms: number) {
  frames.length = 0;
  let last = performance.now();
  const end = last + ms;
  const tick = (t: number) => { frames.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

// Timelines are thenables (awaiting one waits for it to finish), so each demo returns { tl }.
Object.assign(window, { demos: { drag, arrive, layer, count }, clock, frames, animate, utils });

const session = { user: { id: userId, name: userId === "user-a" ? "User A" : "User B" }, deviceId: "usera-1", folder: "Test", version: "0", builtAt: LATER, openInvite: () => undefined, plainFiles: () => { throw new Error("no plain files"); }, onTick: () => () => undefined };
createRoot(document.getElementById("root")!).render(
  <ShellProvider engine={fakeEngine()}><DataProvider data={device.data}><SessionContext.Provider value={session}><AppProvider><AppFrame /></AppProvider></SessionContext.Provider></DataProvider></ShellProvider>,
);
