// The Office section of the admin page: the office record's fields, saved with office.save.
import type { AdminPanel, AdminPanelContext } from "@trellis/framework";
import { commands, OFFICE_ID } from "@/domain/commands";
import { nowIso, statusLine, textField, textOf } from "./form";
import { officeInput } from "./setup";

const POLICY_CHOICES = [
  ["mask", "Mask them: keep the time, show \"Private, busy\""],
  ["drop", "Drop them: leave them out of the diary"],
] as const;

function policySelect(el: AdminPanelContext["el"], current: string): { select: HTMLSelectElement; nodes: HTMLElement[] } {
  const select = el("select", { id: "office-private-policy" }, ...POLICY_CHOICES.map(([value, text]) => el("option", { value, selected: value === current }, text)));
  return { select, nodes: [el("label", { htmlFor: select.id }, "Private and confidential items"), select] };
}

const AUTOMATE_CHOICES = [
  ["off", "Off"],
  ["on", "On: read diary updates from the automate folder"],
] as const;

function automateSelect(el: AdminPanelContext["el"], on: boolean): { select: HTMLSelectElement; nodes: HTMLElement[] } {
  const select = el("select", { id: "office-automate" }, ...AUTOMATE_CHOICES.map(([value, text]) => el("option", { value, selected: (value === "on") === on }, text)));
  return {
    select,
    nodes: [
      el("label", { htmlFor: select.id }, "Power Automate"),
      select,
      el("p", { className: "muted" }, "Diary files in automate/ are not encrypted. Anyone with access to the shared folder can read them, even without the workspace key."),
    ],
  };
}

function render(ctx: AdminPanelContext, notice: { text: string }): Node[] {
  const { el, data } = ctx;
  const row = data.view("office").byId(OFFICE_ID);
  const value = (field: string): string => textOf(row?.[field]);
  const name = textField(el, "office-name", "Office name", value("name"));
  const zone = textField(el, "office-timezone", "Time zone (IANA, such as Europe/London)", value("timezone"), "Europe/London");
  const start = textField(el, "office-day-start", "Working day starts (HH:MM)", value("dayStart"), "08:00");
  const end = textField(el, "office-day-end", "Working day ends (HH:MM)", value("dayEnd"), "18:00");
  const number = (field: string): string => (typeof row?.[field] === "number" ? String(row[field]) : "");
  const longRun = textField(el, "office-long-run", "Day summary: flag a run without a break longer than (hours)", number("longRunHours"), "4");
  const placeChange = textField(el, "office-place-change", "Day summary: flag a change of place less than this apart (minutes)", number("placeChangeMinutes"), "30");
  const policy = policySelect(el, value("privatePolicy") || "mask");
  const automate = automateSelect(el, row?.automate === true);
  const status = statusLine(el, notice.text);
  const save = el("button", { id: "office-save" }, "Save");
  save.addEventListener("click", () => {
    const built = officeInput({ name: name.input.value, timezone: zone.input.value, dayStart: start.input.value, dayEnd: end.input.value, privatePolicy: policy.select.value, automate: automate.select.value, longRunHours: longRun.input.value, placeChangeMinutes: placeChange.input.value }, nowIso());
    if (!built.ok) return void (status.textContent = built.error);
    const result = data.run(commands.officeSave, built.input);
    if (!result.ok) return void (status.textContent = result.error);
    notice.text = "The office is saved.";
    ctx.refresh();
  });
  notice.text = "";
  return [
    el("p", {}, "These settings sync to every user like any other data."),
    ...name.nodes, ...zone.nodes, ...start.nodes, ...end.nodes, ...longRun.nodes, ...placeChange.nodes, ...policy.nodes, ...automate.nodes,
    save,
    status,
  ];
}

/** A new Office section; it keeps its last message across a redraw. */
export function officePanel(): AdminPanel {
  const notice = { text: "" };
  return { title: "Office", render: (ctx) => render(ctx, notice) };
}
