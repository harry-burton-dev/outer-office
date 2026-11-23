// The Principals section of the admin page: a table to edit in place, and a
// form to add one, both through principal.save. There is no delete: a
// principal who leaves is marked inactive.
import type { AdminPanel, AdminPanelContext } from "@trellis/framework";
import { commands } from "@/domain/commands";
import { named, nowIso, statusLine, textField, textOf } from "./form";
import { newPrincipalInput, principalChange, sortPrincipals, type PrincipalRow } from "./setup";

type Say = (text: string) => void;

function principalRows(ctx: AdminPanelContext): PrincipalRow[] {
  const rows = ctx.data.view("principals").rows().filter((row) => !row._deleted);
  return sortPrincipals(rows.map((row) => ({ id: row.id, code: textOf(row.code), title: textOf(row.title), order: typeof row.order === "number" ? row.order : 0, active: row.active !== false })));
}

function rowFor(ctx: AdminPanelContext, row: PrincipalRow, done: Say, say: Say): HTMLTableRowElement {
  const { el } = ctx;
  const title = named(el("input", { type: "text", value: row.title }), `Title of ${row.code}`);
  const order = named(el("input", { type: "number", value: String(row.order), step: "any" }), `Order of ${row.code}`);
  const active = named(el("input", { type: "checkbox", checked: row.active }), `${row.code} is active`);
  const save = el("button", {}, "Save");
  save.addEventListener("click", () => {
    const built = principalChange(row, { title: title.value, order: order.value, active: active.checked }, nowIso());
    if (built === null) return say(`Nothing to save for ${row.code}.`);
    if (!built.ok) return say(built.error);
    const result = ctx.data.run(commands.principalSave, built.input);
    if (!result.ok) return say(result.error);
    done(`${row.code} is saved.`);
  });
  const tr = el("tr", {}, el("td", {}, row.code), el("td", {}, title), el("td", {}, order), el("td", {}, active), el("td", {}, save));
  tr.dataset.principal = row.code;
  return tr;
}

function addForm(ctx: AdminPanelContext, done: Say, say: Say): Node[] {
  const { el } = ctx;
  const code = textField(el, "principal-new-code", "Code (letters, digits and hyphens, such as PRINCIPAL-A)", "", "PRINCIPAL-A");
  const title = textField(el, "principal-new-title", "Title", "");
  const add = el("button", { id: "principal-add" }, "Add principal");
  add.addEventListener("click", () => {
    const built = newPrincipalInput(code.input.value, title.input.value, nowIso());
    if (!built.ok) return say(built.error);
    const result = ctx.data.run(commands.principalSave, built.input);
    if (!result.ok) return say(result.error);
    done(`${built.input.code ?? ""} is added.`);
  });
  return [el("h3", {}, "Add principal"), ...code.nodes, ...title.nodes, add];
}

function render(ctx: AdminPanelContext, notice: { text: string }): Node[] {
  const { el } = ctx;
  const status = statusLine(ctx.el, notice.text);
  notice.text = "";
  const say: Say = (text) => void (status.textContent = text);
  const done: Say = (text) => {
    notice.text = text;
    ctx.refresh();
  };
  const rows = principalRows(ctx);
  const body = rows.length ? rows.map((row) => rowFor(ctx, row, done, say)) : [el("tr", {}, el("td", { className: "muted", colSpan: 5 }, "No principals yet."))];
  return [
    el("p", {}, "The senior people whose diaries the office runs. A principal's code cannot be changed once added; to retire one, untick Active."),
    el("table", { id: "principals" }, el("thead", {}, el("tr", {}, ...["Code", "Title", "Order", "Active", ""].map((h) => el("th", {}, h)))), el("tbody", {}, ...body)),
    ...addForm(ctx, done, say),
    status,
  ];
}

/** A new Principals section; it keeps its last message across a redraw. */
export function principalsPanel(): AdminPanel {
  const notice = { text: "" };
  return { title: "Principals", render: (ctx) => render(ctx, notice) };
}
