// The People section of the admin page: one row per user in the framework's
// users table, with a mode select saved through people.setMode on change.
import type { AdminPanel, AdminPanelContext } from "@trellis/framework";
import { commands, type PersonMode } from "@/domain/commands";
import { named, nowIso, statusLine, textOf } from "./form";

type Say = (text: string) => void;

interface UserRow {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly mode: PersonMode;
}

const MODE_CHOICES: readonly (readonly [PersonMode, string])[] = [
  ["assistant", "Assistant"],
  ["viewer", "Viewer"],
];

const isMode = (value: string): value is PersonMode => MODE_CHOICES.some(([mode]) => mode === value);

function userRows(ctx: AdminPanelContext): UserRow[] {
  const people = ctx.data.view("people").rows().filter((row) => !row._deleted);
  const modeOf = (id: string): PersonMode => (people.find((p) => p.userId === id)?.mode === "viewer" ? "viewer" : "assistant");
  const users = (ctx.data.users?.rows() ?? []).filter((row) => !row._deleted);
  return users
    .map((row) => ({ id: row.id, name: textOf(row.name) || row.id, active: row.status !== "inactive", mode: modeOf(row.id) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function rowFor(ctx: AdminPanelContext, row: UserRow, done: Say, say: Say): HTMLTableRowElement {
  const { el } = ctx;
  const select = named(
    el("select", {}, ...MODE_CHOICES.map(([value, text]) => el("option", { value, selected: value === row.mode }, text))),
    `Mode for ${row.name}`,
  );
  select.addEventListener("change", () => {
    if (!isMode(select.value)) return say("Choose assistant or viewer.");
    const result = ctx.data.run(commands.setMode, { now: nowIso(), userId: row.id, mode: select.value });
    if (!result.ok) return say(result.error);
    done(`${row.name} is now ${select.value === "viewer" ? "a viewer" : "an assistant"}.`);
  });
  const tr = el("tr", {}, el("td", {}, row.name), el("td", {}, row.active ? "Active" : "Inactive"), el("td", {}, select));
  tr.dataset.user = row.id;
  return tr;
}

function render(ctx: AdminPanelContext, notice: { text: string }): Node[] {
  const { el } = ctx;
  const status = statusLine(el, notice.text);
  notice.text = "";
  const say: Say = (text) => void (status.textContent = text);
  const done: Say = (text) => {
    notice.text = text;
    ctx.refresh();
  };
  const rows = userRows(ctx);
  const body = rows.length ? rows.map((row) => rowFor(ctx, row, done, say)) : [el("tr", {}, el("td", { className: "muted", colSpan: 3 }, "No users yet. Invite them on this page."))];
  return [
    el("p", {}, "Viewer mode hides the editing controls. It is not a security control: everyone in the workspace holds the same key."),
    el("table", { id: "people" }, el("thead", {}, el("tr", {}, ...["Name", "Status", "Mode"].map((h) => el("th", {}, h)))), el("tbody", {}, ...body)),
    status,
  ];
}

/** A new People section; it keeps its last message across a redraw. */
export function peoplePanel(): AdminPanel {
  const notice = { text: "" };
  return { title: "People", render: (ctx) => render(ctx, notice) };
}
