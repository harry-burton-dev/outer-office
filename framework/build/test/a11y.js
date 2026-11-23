// The accessibility scan two-users.js runs on each screen it reaches, with
// @axe-core/playwright. Violations are split by where the node is: inside
// FullCalendar's own markup (the diary's toolbar and grid, but not the event
// faces the app draws into it) or the app's. Serious and critical violations in
// the app's markup fail the run; moderate and minor ones are printed. Those in
// FullCalendar's markup are reported separately and do not fail it.
// Needs @axe-core/playwright: npm install --no-save @axe-core/playwright

const { default: AxeBuilder } = await import("@axe-core/playwright");

const FAILING = new Set(["serious", "critical"]);

/** Runs in the page: whether the node `selector` names sits in FullCalendar's markup rather than the app's. */
function inFullCalendar(selector) {
  const node = document.querySelector(selector);
  if (!node) return false;
  return node.closest("[data-diary-calendar]") !== null && node.closest("[data-event-face]") === null;
}

/** Waits until no animation is running, so a sheet that is still sliding in is not scanned (or photographed) half-faded. */
export const still = (page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 3000 }).catch(() => {});

export function createA11y() {
  const found = [];

  /** Scans what `page` shows now, under the name `where`. */
  async function scan(page, where) {
    await still(page);
    const { violations } = await new AxeBuilder({ page }).analyze();
    for (const v of violations) {
      for (const node of v.nodes) {
        const target = node.target.join(" ");
        const source = (await page.evaluate(inFullCalendar, String(node.target.at(-1)))) ? "fullcalendar" : "app";
        found.push({ where, rule: v.id, impact: v.impact ?? "minor", source, target, html: node.html.slice(0, 160), summary: (node.failureSummary ?? "").split("\n").slice(1, 2).join("").trim() });
      }
    }
  }

  const failing = () => found.filter((f) => f.source === "app" && FAILING.has(f.impact));

  /** Prints every violation found, grouped by source. */
  function report() {
    const line = (f) => `     [${f.impact}] ${f.rule} on ${f.where}: ${f.target} ${f.summary ? `(${f.summary})` : ""}\n       ${f.html}`;
    const app = found.filter((f) => f.source === "app");
    const calendar = found.filter((f) => f.source === "fullcalendar");
    console.log(`\naccessibility: ${app.length} in the app's markup (${failing().length} serious or critical), ${calendar.length} in FullCalendar's`);
    for (const f of app) console.log(line(f));
    if (calendar.length) console.log("   in FullCalendar's markup (reported, not failing the run):");
    for (const f of calendar) console.log(line(f));
  }

  return { scan, failing, report };
}
