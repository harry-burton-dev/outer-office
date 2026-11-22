// Quick add: one line of text into a task's parts. Names come back as typed;
// the screen resolves them to ids. Text that is not clearly a token stays in
// the title.
import { addDays, weekdayOf } from "./dates";

export interface QuickAdd {
  title: string;
  project?: string;
  section?: string;
  priority?: 1 | 2 | 3 | 4;
  assignee?: string;
  principal?: string;
  due?: string;
  deadline?: string;
}

export interface QuickAddContext {
  /** YYYY-MM-DD in the office zone. */
  today: string;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const PROJECT = /^#[^\s#]/;
const SECTION = /^\/[^\s/]+$/;
const PRIORITY = /^[pP]([1-4])$/;
const PERSON = /^\+[A-Za-z][\w.-]*$/;
const PRINCIPAL = /^\^[A-Za-z0-9][A-Za-z0-9-]*$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MONTH = /^(\d{1,2})\/(\d{1,2})$/;
const DAY = /^\d{1,2}$/;
const BRACES = /\{([^{}]*)\}/g;

const pad = (n: number) => String(n).padStart(2, "0");

/** A real calendar date as YYYY-MM-DD, or undefined. */
function realDate(year: number, month: number, day: number): string | undefined {
  const date = `${year}-${pad(month)}-${pad(day)}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : undefined;
}

/** A day and month on or after today: this year, else next year. */
function nextDayMonth(day: number, month: number, today: string): string | undefined {
  const year = Number(today.slice(0, 4));
  const thisYear = realDate(year, month, day);
  if (thisYear === undefined) return undefined;
  return thisYear >= today ? thisYear : realDate(year + 1, month, day);
}

function monthOf(word: string): number | undefined {
  const lower = word.toLowerCase();
  const index = MONTH_NAMES.indexOf(lower) >= 0 ? MONTH_NAMES.indexOf(lower) : MONTHS.indexOf(lower === "sept" ? "sep" : lower);
  return index >= 0 ? index + 1 : undefined;
}

function weekdayDate(word: string, today: string): string | undefined {
  const lower = word.toLowerCase();
  const index = WEEKDAYS.findIndex((name) => name === lower || name.slice(0, 3) === lower);
  if (index < 0) return undefined;
  const ahead = ((index - weekdayOf(today) + 6) % 7) + 1;
  return addDays(today, ahead);
}

function singleWordDate(word: string, today: string): string | undefined {
  const lower = word.toLowerCase();
  if (lower === "today") return today;
  if (lower === "tomorrow") return addDays(today, 1);
  const iso = ISO_DATE.exec(word);
  if (iso) return realDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dayMonth = DAY_MONTH.exec(word);
  if (dayMonth) return nextDayMonth(Number(dayMonth[1]), Number(dayMonth[2]), today);
  return weekdayDate(word, today);
}

/** A date starting at tokens[i], and how many tokens it used. */
function readDate(tokens: readonly string[], i: number, today: string): { date: string; used: number } | undefined {
  const word = tokens[i];
  const next = tokens[i + 1];
  if (DAY.test(word) && next !== undefined && monthOf(next) !== undefined) {
    const date = nextDayMonth(Number(word), monthOf(next) as number, today);
    return date === undefined ? undefined : { date, used: 2 };
  }
  const date = singleWordDate(word, today);
  return date === undefined ? undefined : { date, used: 1 };
}

const isMarker = (token: string) =>
  PROJECT.test(token) || SECTION.test(token) || PRIORITY.test(token) || PERSON.test(token) || PRINCIPAL.test(token);

/** The first braced date, and the text without it. Braces that hold no date are left alone. */
function takeDeadline(text: string, today: string): { rest: string; deadline?: string } {
  for (const match of text.matchAll(BRACES)) {
    const words = match[1].trim().split(/\s+/).filter(Boolean);
    const found = words.length > 0 ? readDate(words, 0, today) : undefined;
    if (found && found.used === words.length) {
      const index = match.index ?? 0;
      return { rest: `${text.slice(0, index)} ${text.slice(index + match[0].length)}`, deadline: found.date };
    }
  }
  return { rest: text };
}

type Found = Omit<QuickAdd, "title">;

/** Reads the project name from tokens[i] (which starts with #) up to the next marker or date. */
function readProject(tokens: readonly string[], i: number, today: string): { name: string; used: number } {
  const words = [tokens[i].slice(1)];
  let j = i + 1;
  while (j < tokens.length && !isMarker(tokens[j]) && readDate(tokens, j, today) === undefined) {
    words.push(tokens[j]);
    j += 1;
  }
  return { name: words.join(" "), used: j - i };
}

/** The token at i as one part, or undefined when it belongs to the title. */
function readToken(tokens: readonly string[], i: number, found: Found, today: string): { part: Found; used: number } | undefined {
  const token = tokens[i];
  const priority = PRIORITY.exec(token);
  if (priority && found.priority === undefined) return { part: { priority: Number(priority[1]) as 1 | 2 | 3 | 4 }, used: 1 };
  if (PROJECT.test(token) && found.project === undefined) {
    const { name, used } = readProject(tokens, i, today);
    return { part: { project: name }, used };
  }
  if (SECTION.test(token) && found.section === undefined) return { part: { section: token.slice(1) }, used: 1 };
  if (PERSON.test(token) && found.assignee === undefined) return { part: { assignee: token.slice(1) }, used: 1 };
  if (PRINCIPAL.test(token) && found.principal === undefined) return { part: { principal: token.slice(1) }, used: 1 };
  if (found.due !== undefined) return undefined;
  const date = readDate(tokens, i, today);
  return date && { part: { due: date.date }, used: date.used };
}

export function parseQuickAdd(text: string, context: QuickAddContext): QuickAdd {
  const { rest, deadline } = takeDeadline(text, context.today);
  const tokens = rest.split(/\s+/).filter(Boolean);
  let found: Found = deadline === undefined ? {} : { deadline };
  const title: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const read = readToken(tokens, i, found, context.today);
    if (read) {
      found = { ...found, ...read.part };
      i += read.used;
    } else {
      title.push(tokens[i]);
      i += 1;
    }
  }
  return { title: title.join(" "), ...found };
}
