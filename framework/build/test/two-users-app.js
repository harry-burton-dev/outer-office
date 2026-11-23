// The app's side of two-users.js: the synthetic .ics files, and how a user
// reaches each screen, panel and dialog of Outer Office, found by role and
// accessible name. Probes return plain data describing what a page shows.
import { calendar, LONDON_TZID, outlookUid, vevent } from "../../../app/src/import/fixtures/outlook-ics.ts";

const ZONE = "Europe/London";
const DAY_MS = 86_400_000;

/** YYYY-MM-DD in the office zone, `days` after today. */
export function dayFromToday(days) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(Date.now() + days * DAY_MS));
}

/** The Monday of the week the calendar opens on (on a Saturday or Sunday, the coming one), as YYYY-MM-DD. */
function openingMonday() {
  const today = new Date(`${dayFromToday(0)}T12:00:00Z`);
  const weekday = today.getUTCDay();
  const shift = weekday === 6 ? 2 : weekday === 0 ? 1 : 1 - weekday;
  return new Date(today.getTime() + shift * DAY_MS).toISOString().slice(0, 10);
}

const compact = (date) => date.replaceAll("-", "");
const local = (prop, date, time) => `${prop};TZID=${LONDON_TZID}:${compact(date)}T${time.replace(":", "")}00`;
const busy = ["TRANSP:OPAQUE", "X-MICROSOFT-CDO-BUSYSTATUS:BUSY"];

/** The week's five days, Monday first, as YYYY-MM-DD. */
export function weekDays() {
  const monday = Date.parse(`${openingMonday()}T12:00:00Z`);
  return [0, 1, 2, 3, 4].map((n) => new Date(monday + n * DAY_MS).toISOString().slice(0, 10));
}

export const SUBJECTS = { review: "Weekly review", budget: "Budget meeting", visit: "Site visit planning", board: "Board briefing", catchUp: "Team catch-up" };
export const MASKED = "Private, busy";

/** One timed event in Outlook's shape, on `date` from `start` to `end` local time. */
const timed = (n, subject, date, start, end, more = []) =>
  vevent(outlookUid(n), [`SUMMARY:${subject}`, local("DTSTART", date, start), local("DTEND", date, end), ...more, ...busy]);

/**
 * The first export: five meetings across the week and one private item
 * (stored masked). The second: the budget meeting has moved from Tuesday 11:00
 * to Wednesday 14:00 (with a newer LAST-MODIFIED) and the site visit is no longer
 * there. The first and last meetings stay, so the second file's range still
 * covers the missing one.
 */
export function icsFiles() {
  const [mon, tue, wed, thu, fri] = weekDays();
  const review = timed(101, SUBJECTS.review, mon, "09:00", "10:00", ["LOCATION:Room 1", 'ORGANIZER;CN="Alex Example":mailto:alex@example.invalid']);
  const visit = timed(103, SUBJECTS.visit, wed, "10:00", "11:00", ["LOCATION:Room 3"]);
  const board = timed(104, SUBJECTS.board, thu, "15:00", "16:00", ["LOCATION:Board room"]);
  const personal = timed(105, "Personal appointment", thu, "09:00", "10:00", ["CLASS:PRIVATE", "LOCATION:Somewhere private"]);
  const catchUp = timed(106, SUBJECTS.catchUp, fri, "16:00", "17:00");
  const budget = timed(102, SUBJECTS.budget, tue, "11:00", "12:00", ["LOCATION:Room 2"]);
  const stamp = `LAST-MODIFIED:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const moved = timed(102, SUBJECTS.budget, wed, "14:00", "15:00", ["LOCATION:Room 2", stamp]);
  return {
    first: calendar([review, budget, visit, board, personal, catchUp]),
    second: calendar([review, moved, board, personal, catchUp]),
    days: { mon, tue, wed, thu, fri },
  };
}

// ---- getting about ----

/** Clicks a sidebar item by its name. */
export const go = (u, name) => u.page.getByRole("navigation", { name: "Main" }).getByRole("button", { name, exact: true }).click();

/** The principal switch's choices, in order, and which is pressed. */
export const principalChoices = (u) =>
  u.page.getByRole("group", { name: "Principal" }).getByRole("button").evaluateAll((buttons) => buttons.map((b) => ({ code: b.textContent, pressed: b.getAttribute("aria-pressed") === "true" }))).catch(() => []);

export const choosePrincipal = (u, code) => u.page.getByRole("group", { name: "Principal" }).getByRole("button", { name: code, exact: true }).click();

/** The open sheet or dialog. */
export const dialog = (u) => u.page.getByRole("dialog");

/** Closes the open sheet or dialog with Escape and waits until it has gone. */
export async function closeDialog(u) {
  await u.page.keyboard.press("Escape");
  await dialog(u).waitFor({ state: "detached", timeout: 5000 });
}

/** On a task screen for the first time: the privacy notice, acknowledged. */
export async function ackPrivacyIfShown(u) {
  const notice = u.page.getByRole("dialog").filter({ has: u.page.getByRole("heading", { name: "Before you use Tasks" }) });
  if (await notice.isVisible().catch(() => false)) {
    await notice.getByRole("button", { name: "I understand" }).click();
    await notice.waitFor({ state: "detached", timeout: 10000 });
    return true;
  }
  return false;
}

// ---- calendar and engagement ----

/** Every event on the calendar: its day column, title and marks, sorted. */
export const calendarShows = (u) =>
  u.page.evaluate(() =>
    [...document.querySelectorAll("[data-event-face]")]
      .map((face) => ({
        day: face.closest("[data-date]")?.getAttribute("data-date") ?? "",
        title: face.firstElementChild?.textContent ?? "",
        marks: [...face.querySelectorAll("[data-mark]")].map((m) => m.textContent),
      }))
      .sort((x, y) => `${x.day} ${x.title}`.localeCompare(`${y.day} ${y.title}`)),
  );

export const titles = (events) => events.map((e) => e.title).join(" | ");
export const eventTitled = (events, title) => events.find((e) => e.title === title);

/** Opens an event's engagement panel from the calendar, on `tab` (Overview holds the flag, Notes the notes). */
export async function openEngagement(u, title, tab = "Notes") {
  await u.page.locator("[data-event-face]").filter({ hasText: title }).first().click();
  await dialog(u).getByRole("tab", { name: tab }).click();
  return dialog(u);
}

/** What the engagement panel shows: when, the flag and the notes. Closes it again. */
export async function engagementShows(u, title) {
  const panel = await openEngagement(u, title, "Overview");
  const when = await panel.locator("[data-slot=sheet-description]").first().textContent().catch(() => "");
  const flagged = (await panel.getByRole("switch", { name: "Flag" }).getAttribute("aria-checked")) === "true";
  await panel.getByRole("tab", { name: "Notes" }).click();
  const shown = { when, flagged, notes: await panel.getByRole("textbox", { name: "Notes" }).inputValue() };
  await closeDialog(u);
  return shown;
}

// ---- import ----

/** Chooses `path` on the Import screen and returns the review section. */
export async function chooseIcs(u, path) {
  await u.page.getByLabel("Calendar file").setInputFiles(path);
  const review = u.page.getByRole("region", { name: "Review" });
  await review.waitFor({ timeout: 10000 });
  return review;
}

/** The review's change rows, as text per cell. */
export const reviewRows = (review) =>
  review.getByRole("table", { name: "Changes" }).getByRole("row").evaluateAll((rows) => rows.slice(1).map((r) => [...r.cells].map((c) => c.textContent.trim())));

/** Applies the reviewed import and dismisses the reminder that follows. */
export async function applyImport(u) {
  await u.page.getByRole("button", { name: "Apply import" }).click();
  await u.page.getByRole("status").filter({ hasText: "Imported." }).waitFor({ timeout: 10000 });
  await u.page.getByRole("button", { name: "Dismiss" }).click();
}

// ---- tasks ----

/** Quick add from the top bar: types `text` and presses Enter. */
export async function quickAdd(u, text) {
  await u.page.locator("header").getByRole("button", { name: "Add task" }).click();
  const box = dialog(u).getByRole("textbox", { name: "Task" });
  await box.fill(text);
  await box.press("Enter");
  await dialog(u).waitFor({ state: "detached", timeout: 5000 });
}

/** The task rows on the current task screen: title and the quiet line under it. */
export const taskRows = (u) =>
  u.page.getByTestId("task-row").evaluateAll((rows) => rows.map((row) => row.innerText.replace(/\s+/g, " ").trim()));

/** The task titles on the current task screen, in order (the quiet line differs by viewer: nobody sees their own name). */
export const taskTitles = (u) =>
  u.page.getByTestId("task-row").evaluateAll((rows) => rows.map((row) => row.querySelector("button:not([role=checkbox]) > span")?.textContent ?? ""));

/** Opens a task's panel from the current list. */
export async function openTask(u, title) {
  await u.page.getByTestId("task-row").filter({ hasText: title }).first().getByRole("button").first().click();
  return dialog(u);
}

/** What the task panel shows for the assignment and deadline. Closes it again. */
export async function taskShows(u, title) {
  const panel = await openTask(u, title);
  const shown = {
    assignment: (await panel.getByRole("region", { name: "Assignment" }).locator("p").first().textContent()).trim(),
    deadline: await panel.locator("#task-deadline").inputValue(),
  };
  await closeDialog(u);
  return shown;
}

/** Sets a task's deadline in its panel and closes it. */
export async function setDeadline(u, title, date) {
  const panel = await openTask(u, title);
  await panel.locator("#task-deadline").fill(date);
  await closeDialog(u);
}

/** The Needs action drawer's sections, as titles and their rows' text. Closes it again. */
export async function needsActionShows(u) {
  await u.page.getByRole("button", { name: /^Needs action/ }).click();
  const panel = dialog(u);
  await panel.getByRole("heading", { name: "Needs action" }).waitFor();
  const sections = await panel.locator("section").evaluateAll((all) =>
    all.map((s) => ({ title: s.querySelector("h3")?.textContent ?? "", rows: [...s.querySelectorAll("li")].map((li) => li.innerText.replace(/\s+/g, " ").trim()) })),
  );
  await closeDialog(u);
  return sections;
}

/** The conflict prompt's count ("" when there is none). */
export const conflictCount = (u) => u.page.locator("#conflicts > button").textContent({ timeout: 500 }).catch(() => "");

/** Opens the conflict prompt and returns the "Keep ..." choices it offers. */
export async function openPrompt(u) {
  const toggle = u.page.locator("#conflicts > button");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  return u.page.getByRole("button", { name: /^Keep "/ }).allTextContents();
}

// ---- log ----

/** The Log table's rows, as text per cell. */
export const logRows = (u) =>
  u.page.getByRole("table", { name: "Log" }).getByRole("row").evaluateAll((rows) => rows.slice(1).map((r) => [...r.cells].map((c) => c.textContent.trim()))).catch(() => []);
