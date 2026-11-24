// Two-user test from built files (S4 Deliver 5, gate G7), for Outer Office. It
// lives under test/ because it drives the app by its screens and names, which
// gate G4 keeps out of framework source. Builds the bootstrap, the admin page
// and the app bundle with a throwaway signing key, puts the signed release into
// a stand-in shared folder (stand-in-folder.js), and opens the pages from disk
// (file://), each in a browser context of its own: each context has its own
// IndexedDB, so the pages are separate devices. Two users, A (Alex Example)
// and B (Blair Sample), share the folder:
//
//   1. set-up on the real admin page: the admin opens the workspace from its key
//      backup, fills the Office section, adds PRINCIPAL-A and PRINCIPAL-B, and
//      invites A and B (the workspace.json and key backup are made here in Node)
//   2. A and B enrol from their invites; both show the principal switch with both
//   3. A imports a synthetic .ics for PRINCIPAL-A; B shows the same events for
//      PRINCIPAL-A and none for PRINCIPAL-B
//   4. B flags an engagement and writes a note; A sees the mark
//      on the calendar and the note in the panel
//   5. A creates the shared project and adds tasks with quick add, one tagged to
//      PRINCIPAL-A, assigned to B and due today; B finds it in Today as offered
//      and accepts; A sees it accepted; Needs action lists it on both
//   6. the folder is partitioned and A and B each set a different deadline (an
//      "ask" field) on that task; after healing both show the shell's conflict
//      prompt with both; A keeps one; B's prompt clears and both show it
//   7. A imports a second .ics where the annotated event moved and another is
//      missing; the review lists them as moved and gone; B shows the move, not
//      the gone event, and the note is still on the moved engagement
//   8. the Log for PRINCIPAL-A lists the import, the flag change and the task
//      changes on both pages, with people's names
//   9. both pages show the same events, overlay and tasks
//
// Along the way it scans each screen with axe (a11y.js) and saves the README's
// screenshots to docs/screenshots/. Saving and reading are driven by the
// diagnostics view's "Save now" and "Read folder now" (opened from the status
// badge's menu), not by waiting for timers.
//
// NOT covered: the real folder and file pickers (headless Chrome cannot drive
// them, so the folder picker returns the stand-in and the save picker keeps the
// passport in the page) and a real synced folder (the stand-in is a local
// directory; a sync client's delays, conflict copies and placeholders are not
// reproduced). Reading a real folder handle and keeping it in IndexedDB are
// also not covered. Hashing, signature checks, the IndexedDB cache, enrolling,
// the admin page, the engine, the shell and the app are real.
//
// `--release <folder>` skips the build and runs against a release folder made
// elsewhere, such as the <name>/ folder unzipped from a GitHub Release (gate
// G13). Its bootstrap, admin page and signed manifest are used as they are.
// Needs Playwright with Chromium, and @axe-core/playwright. Exit code 1 on any failed check.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createStandInFolder } from "../stand-in-folder.js";
import { createA11y, still } from "./a11y.js";
import { adminSection, buildRelease, chromium, invite, makeWorkspace, openAdmin, openUser, read, readUntil, ROOT, save, settle } from "./two-users-harness.js";
import * as app from "./two-users-app.js";

const { values: args } = parseArgs({ options: { release: { type: "string" } } });
const RELEASE = args.release ? resolve(args.release) : join(ROOT, "dist", "two-users-release");
const SHOTS = join(ROOT, "docs", "screenshots");
const PRINCIPALS = [["PRINCIPAL-A", "First principal"], ["PRINCIPAL-B", "Second principal"]];
const [ALEX, BLAIR] = ["Alex Example", "Blair Sample"];
const NOTE = "Papers to the principal by Monday; confirm the room.";
const TASK = "Send the briefing pack";
const { SUBJECTS } = app;

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push(ok);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : `: ${detail}`}`);
};
const json = (value) => JSON.stringify(value);
const a11y = createA11y();
/** A README screenshot of what `u` shows, once still and with no focus ring left from closing a sheet. */
const shot = async (u, file) => {
  await still(u.page);
  await u.page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await u.page.screenshot({ path: join(SHOTS, file) });
};

/** Step 1: the admin page opens the workspace, sets up the office and the principals, and invites A and B. */
async function adminSetup(browser, folder, backup) {
  const admin = await openAdmin(browser, folder, RELEASE, backup, "admin");
  const { page } = admin;
  await page.getByLabel("Office name").fill("Example Office");
  await page.getByLabel(/^Time zone/).fill("Europe/London");
  await page.getByLabel(/^Working day starts/).fill("08:00");
  await page.getByLabel(/^Working day ends/).fill("18:00");
  await adminSection(page, "Office").getByRole("button", { name: "Save" }).click();
  const officeSaid = await adminSection(page, "Office").getByText("The office is saved.").waitFor({ timeout: 5000 }).then(() => true, () => false);
  check("1. admin: the Office section saves the office's name, time zone and working day", officeSaid);
  for (const [code, title] of PRINCIPALS) {
    await page.getByLabel(/^Code/).fill(code);
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByRole("button", { name: "Add principal" }).click();
    await adminSection(page, "Principals").getByText(`${code} is added.`).waitFor({ timeout: 5000 }).catch(() => {});
  }
  const listed = await adminSection(page, "Principals").getByRole("row").allInnerTexts();
  check("1. admin: both principals are added", PRINCIPALS.every(([code]) => listed.some((r) => r.startsWith(code))), json(listed));
  const invites = [await invite(page, ALEX), await invite(page, BLAIR)];
  check("1. admin: an invite downloads for each user", json(invites.map((i) => i.file)) === json(["alexexample.invite.json", "blairsample.invite.json"]), json(invites.map((i) => i.file)));
  await admin.context.close();
  return { invites, errors: admin.errors };
}

/** The admin page in a later session: its three sections, scanned and photographed. */
async function adminLater(browser, folder, backup) {
  const admin = await openAdmin(browser, folder, RELEASE, backup, "admin-later");
  const people = await adminSection(admin.page, "People").getByRole("row").allInnerTexts();
  check("9. admin: a later session's People section lists both users", [ALEX, BLAIR].every((n) => people.some((r) => r.startsWith(n))), json(people));
  const zone = await admin.page.getByLabel(/^Time zone/).inputValue();
  check("9. admin: a later session's Office section shows what was saved", zone === "Europe/London", zone);
  await a11y.scan(admin.page, "admin page");
  await adminSection(admin.page, "Office").scrollIntoViewIfNeeded();
  await admin.page.screenshot({ path: join(SHOTS, "admin.png"), fullPage: true });
  await admin.context.close();
  return admin.errors;
}

/** Step 3: A imports the first file; B shows its events for PRINCIPAL-A and none for PRINCIPAL-B. */
async function firstImport(A, B, files) {
  await app.go(A, "Import");
  const review = await app.chooseIcs(A, files.first);
  const rows = await app.reviewRows(review);
  check("3. A: the review lists the file's six events as added", rows.length === 6 && rows.every((r) => r[0] === "Added"), json(rows));
  await a11y.scan(A.page, "Import (review step)");
  await app.applyImport(A);
  await a11y.scan(A.page, "Import (done, with history)");
  await app.go(A, "Calendar");
  await A.page.locator("[data-event-face]").first().waitFor({ timeout: 10000 }).catch(() => {});
  const onA = await app.calendarShows(A);
  const expected = [SUBJECTS.review, SUBJECTS.budget, SUBJECTS.visit, app.MASKED, SUBJECTS.board, SUBJECTS.catchUp];
  check("3. A: the calendar shows the imported week, the private item masked", expected.every((t) => app.eventTitled(onA, t)) && onA.length === 6, json(onA));
  await save(A);
  const same = await readUntil(B, app.calendarShows, (v) => json(v) === json(onA));
  check("3. B reads the folder and shows the same events for PRINCIPAL-A", same, app.titles(await app.calendarShows(B)));
  await app.choosePrincipal(B, "PRINCIPAL-B");
  const empty = await B.page.getByText("No calendar imported yet").isVisible();
  check("3. B: PRINCIPAL-B has no events", empty && (await app.calendarShows(B)).length === 0, app.titles(await app.calendarShows(B)));
  await app.choosePrincipal(B, "PRINCIPAL-A");
  await a11y.scan(A.page, "Calendar");
}

/** Step 4: B flags the meeting and writes a note; A sees both. (Prep was replaced by cards, OUT-62.) */
async function flagAndNote(A, B) {
  const panel = await app.openEngagement(B, SUBJECTS.budget, "Overview");
  await panel.getByRole("switch", { name: "Flag" }).click();
  await panel.getByRole("tab", { name: "Notes" }).click();
  await panel.getByRole("textbox", { name: "Notes" }).fill(NOTE);
  // Escape straight from the field, with no blur first: the note must still save (OUT-80).
  await app.closeDialog(B);
  await save(B);
  const marked = await readUntil(A, app.calendarShows, (v) => app.eventTitled(v, SUBJECTS.budget)?.marks.includes("Flagged"));
  check("4. A shows B's flag on the calendar", marked, json(app.eventTitled(await app.calendarShows(A), SUBJECTS.budget)));
  const onA = await app.engagementShows(A, SUBJECTS.budget);
  check("4. A shows B's note in the engagement panel", onA.flagged && onA.notes === NOTE, json(onA));
  await app.openEngagement(A, SUBJECTS.budget);
  await a11y.scan(A.page, "engagement panel (Notes tab)");
  await shot(A, "engagement.png");
  await app.closeDialog(A);
}

/** Step 5: A makes the shared project and adds tasks; B accepts the one assigned; Needs action lists it on both. */
async function tasks(A, B, days) {
  await app.go(A, "Project");
  check("5. A: the privacy notice shows before Tasks, and is acknowledged", await app.ackPrivacyIfShown(A));
  await A.page.getByRole("button", { name: "Create the shared project" }).click();
  await A.page.getByRole("heading", { name: "Office work" }).waitFor({ timeout: 5000 });
  await A.page.locator("header").getByRole("button", { name: "Add task" }).click();
  await app.dialog(A).getByRole("textbox", { name: "Task" }).fill(`${TASK} today +Blair ^PRINCIPAL-A #office work`);
  await a11y.scan(A.page, "quick add (with its preview)");
  await app.closeDialog(A);
  await app.quickAdd(A, `${TASK} today +Blair ^PRINCIPAL-A #office work`);
  await app.quickAdd(A, "Draft the weekly note p2 tomorrow #office work");
  await app.quickAdd(A, `Book the room for the board briefing ^PRINCIPAL-A ${days.thu} #office work`);
  const rows = await app.taskRows(A);
  check("5. A: quick add puts three tasks in the shared project", rows.length === 3 && rows.some((r) => r.startsWith(TASK) && r.includes(BLAIR) && r.includes("PRINCIPAL-A")), json(rows));
  const offered = await app.taskShows(A, TASK);
  check("5. A: the task is offered to B", offered.assignment === `Offered to ${BLAIR} by ${ALEX}`, json(offered));
  await save(A);

  await app.go(B, "Today");
  await app.ackPrivacyIfShown(B);
  const inToday = await readUntil(B, app.taskRows, (r) => r.some((t) => t.startsWith(TASK)));
  check("5. B: the task A assigned is in B's Today", inToday, json(await app.taskRows(B)));
  const panel = await app.openTask(B, TASK);
  const asB = (await panel.getByRole("region", { name: "Assignment" }).locator("p").first().textContent()).trim();
  check("5. B: the task panel says it is offered to B, with Accept", asB === `Offered to ${BLAIR} by ${ALEX}` && (await panel.getByRole("button", { name: "Accept" }).isVisible()), asB);
  await panel.getByRole("button", { name: "Accept" }).click();
  await panel.getByText(`Accepted by ${BLAIR}`).waitFor({ timeout: 5000 }).catch(() => {});
  await app.closeDialog(B);
  await save(B);
  const accepted = await readUntil(A, (u) => app.taskShows(u, TASK), (v) => v.assignment === `Accepted by ${BLAIR}, assigned by ${ALEX}`);
  check("5. A sees the task accepted by B", accepted, json(await app.taskShows(A, TASK)));
  for (const u of [A, B]) {
    const lists = await app.needsActionShows(u);
    const dueToday = lists.find((s) => s.title === "Due today")?.rows ?? [];
    check(`5. ${u.label}: Needs action for PRINCIPAL-A lists the task as due today`, dueToday.some((r) => r.startsWith(TASK)), json(lists));
  }
  await A.page.getByRole("button", { name: /^Needs action/ }).click();
  await a11y.scan(A.page, "Needs action");
  await shot(A, "needs-action.png");
  await app.closeDialog(A);
  await a11y.scan(A.page, "task list (shared project)");
  await shot(A, "tasks.png");
  await app.openTask(A, TASK);
  await a11y.scan(A.page, "task panel");
  await shot(A, "task-panel.png");
  await app.closeDialog(A);
}

/** Step 6: concurrent deadlines on the task while the folder is partitioned, then the conflict prompt. */
async function conflict(A, B, folder) {
  await app.go(B, "Office work");
  const [kept, other] = [app.dayFromToday(3), app.dayFromToday(4)];
  await folder.partition(true);
  await app.setDeadline(A, TASK, kept);
  await app.setDeadline(B, TASK, other);
  await save(A);
  await save(B);
  const deadline = (u) => app.taskShows(u, TASK).then((v) => v.deadline);
  const aApart = !(await readUntil(A, deadline, (d) => d === other, 3000));
  const bApart = !(await readUntil(B, deadline, (d) => d === kept, 3000));
  check("6. while partitioned neither sees the other's deadline", aApart && bApart, `${await deadline(A)} / ${await deadline(B)}`);
  await folder.partition(false);
  const prompted = await settle(A, B, app.conflictCount, (c) => c === "1 needs a decision");
  check("6. after healing both show the conflict prompt", prompted, `${await app.conflictCount(A)} / ${await app.conflictCount(B)}`);
  const choices = [(await app.openPrompt(A)).sort(), (await app.openPrompt(B)).sort()];
  const expected = json([`Keep "${kept}"`, `Keep "${other}"`]);
  check("6. both prompts offer both deadlines", choices.every((c) => json(c) === expected), json(choices));
  await A.page.getByRole("button", { name: `Keep "${kept}"` }).click();
  const cleared = await settle(A, B, app.conflictCount, (c) => c === "");
  const both = [await deadline(A), await deadline(B)];
  check(`6. A keeps ${kept}: B's prompt clears and both show that deadline`, cleared && both.every((d) => d === kept), `${await app.conflictCount(B)} / ${json(both)}`);
}

/** Step 7: the second file moves the annotated event and drops another. */
async function secondImport(A, B, files) {
  await app.go(A, "Import");
  const review = await app.chooseIcs(A, files.second);
  const rows = await app.reviewRows(review);
  const moved = rows.find((r) => r[0].startsWith("Moved"));
  const gone = rows.find((r) => r[0].startsWith("Gone"));
  check("7. A: the review lists the budget meeting as moved, with its notes", moved?.[1] === SUBJECTS.budget && moved[0].includes("has notes"), json(rows));
  check("7. A: the review lists the site visit as gone", gone?.[1] === SUBJECTS.visit && rows.length === 2, json(rows));
  await shot(A, "import-review.png");
  await app.applyImport(A);
  await save(A);
  await app.go(B, "Calendar");
  const { wed } = files.days;
  const shows = (v) => app.eventTitled(v, SUBJECTS.budget)?.day === wed && !app.eventTitled(v, SUBJECTS.visit);
  const ok = await readUntil(B, app.calendarShows, shows);
  check("7. B shows the meeting on its new day and the gone event off the calendar", ok, json(await app.calendarShows(B)));
  const marks = app.eventTitled(await app.calendarShows(B), SUBJECTS.budget)?.marks ?? [];
  check("7. B: the moved meeting keeps its flag and is marked moved", json(marks) === json(["Flagged", "Moved"]), json(marks));
  const onB = await app.engagementShows(B, SUBJECTS.budget);
  check("7. B: the note is still on the moved engagement", onB.notes === NOTE && onB.when.includes("14:00"), json(onB));
  await shot(B, "calendar.png");
}

/** Step 8: the Log for PRINCIPAL-A, on both. */
async function log(A, B) {
  for (const u of [A, B]) {
    await app.go(u, "Log");
    const rows = await app.logRows(u);
    const has = (who, area, what) => rows.some((r) => r[1] === who && r[2] === area && r[3] === what);
    const wanted = [[ALEX, "Import", "Import applied"], [BLAIR, "Overlay", "Flag changed"], [ALEX, "Task", "Created"], [BLAIR, "Task", "Accepted"]];
    const missing = wanted.filter((w) => !has(...w));
    check(`8. ${u.label}: the Log lists the import, the flag change and the task changes, by name`, missing.length === 0, `missing ${json(missing)} in ${json(rows.map((r) => r.slice(1, 5)))}`);
    const ids = rows.filter((r) => r.some((c) => /^(alexexample|blairsample|admin)$/.test(c)));
    check(`8. ${u.label}: no Log row shows a user id`, ids.length === 0, json(ids));
  }
  await a11y.scan(A.page, "Log");
  await shot(A, "log.png");
}

/** Step 9: what each page shows, side by side. */
async function compare(A, B) {
  const view = async (u) => {
    await app.go(u, "Calendar");
    const events = await app.calendarShows(u);
    const engagement = await app.engagementShows(u, SUBJECTS.budget);
    await app.go(u, "Office work");
    const project = await app.taskTitles(u);
    const task = await app.taskShows(u, TASK);
    const needs = await app.needsActionShows(u);
    return { events, engagement, project, task, needs };
  };
  await read(A);
  await read(B);
  const [a, b] = [await view(A), await view(B)];
  check("9. both pages show the same events, overlay and tasks", json(a) === json(b) && a.events.length === 5 && a.project.length === 3, `${json(a)}\n     ${json(b)}`);
}

mkdirSync(SHOTS, { recursive: true });
if (!args.release) await buildRelease(RELEASE);
const folder = await createStandInFolder();
cpSync(join(RELEASE, "app"), join(folder.dir, "app"), { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "two-users-ics-"));
const { first, second, days } = app.icsFiles();
const files = { first: join(scratch, "diary-week.ics"), second: join(scratch, "diary-week-later.ics"), days };
writeFileSync(files.first, first);
writeFileSync(files.second, second);
const backup = await makeWorkspace(folder);
const browser = await chromium.launch();
try {
  const setup = await adminSetup(browser, folder, backup);
  const A = await openUser(browser, folder, RELEASE, "A", setup.invites[0]);
  const B = await openUser(browser, folder, RELEASE, "B", setup.invites[1]);
  check("2. both users accept their invites, connect to the folder and start the app", true);
  check("2. each passport is saved on its user's side", A.saved.join() === "alexexample.passport.json" && B.saved.join() === "blairsample.passport.json", `${A.saved} / ${B.saved}`);
  for (const u of [A, B]) {
    const listed = await readUntil(u, app.principalChoices, (c) => json(c.map((p) => p.code)) === json(["PRINCIPAL-A", "PRINCIPAL-B"]));
    check(`2. ${u.label}: the sidebar's principal switch lists both principals`, listed, json(await app.principalChoices(u)));
  }

  await firstImport(A, B, files);
  await flagAndNote(A, B);
  await tasks(A, B, days);
  await conflict(A, B, folder);
  await secondImport(A, B, files);
  await log(A, B);
  await compare(A, B);
  const adminErrors = await adminLater(browser, folder, backup);

  const errors = [...setup.errors, ...A.errors, ...B.errors, ...adminErrors];
  check("no page errors", errors.length === 0, errors.join(" | "));
  a11y.report();
  const failing = a11y.failing();
  check("accessibility: no serious or critical violations in the app's markup", failing.length === 0, failing.map((f) => `${f.rule} on ${f.where}`).join(", "));
} finally {
  await browser.close();
  await folder.close();
  rmSync(scratch, { recursive: true, force: true });
}
if (checks.includes(false)) process.exit(1);
console.log("two-user test passed");
