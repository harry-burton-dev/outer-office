// The app's admin panels drawn with a real data runtime, in jsdom.
import { describe, expect, test } from "vitest";
import type { AdminPanel, AdminPanelContext } from "@trellis/framework";
import { adminPanels } from "./index";
import { officePanel } from "./office-panel";
import { peoplePanel } from "./people-panel";
import { principalsPanel } from "./principals-panel";
import { byId, idOf, oneDevice, rows, type Device } from "../domain/commands/testing/world";

const el: AdminPanelContext["el"] = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

/** Draws a panel into a container the way the admin page does, redrawing on refresh. */
function mount(panel: AdminPanel, device: Device): HTMLElement {
  const box = document.createElement("div");
  const draw = (): void => {
    const drawn = panel.render({ data: device.data, user: "admin", el, refresh: draw });
    box.replaceChildren(...(Array.isArray(drawn) ? drawn : [drawn as Node]));
  };
  draw();
  return box;
}

const input = (box: HTMLElement, selector: string): HTMLInputElement => box.querySelector(selector) as HTMLInputElement;
const type = (box: HTMLElement, selector: string, value: string): void => void (input(box, selector).value = value);
const click = (box: HTMLElement, selector: string): void => (box.querySelector(selector) as HTMLButtonElement).click();
const status = (box: HTMLElement): string => box.querySelector("p.muted:last-child")?.textContent ?? "";

test("the app offers the Office, Principals and People sections", () => {
  expect(adminPanels.map((p) => p.title)).toEqual(["Office", "Principals", "People"]);
});

describe("Office", () => {
  test("saves the office with office.save and shows what is stored", async () => {
    const device = await oneDevice();
    const box = mount(officePanel(), device);
    expect(box.textContent).toContain("sync to every user");
    type(box, "#office-name", "Test Office");
    type(box, "#office-timezone", "Europe/London");
    type(box, "#office-day-start", "08:00");
    type(box, "#office-day-end", "18:00");
    (box.querySelector("#office-private-policy") as HTMLSelectElement).value = "drop";
    expect((box.querySelector("#office-automate") as HTMLSelectElement).value).toBe("off");
    (box.querySelector("#office-automate") as HTMLSelectElement).value = "on";
    click(box, "#office-save");
    expect(byId(device, "office", "office")).toMatchObject({ name: "Test Office", timezone: "Europe/London", dayStart: "08:00", dayEnd: "18:00", privatePolicy: "drop", automate: true });
    expect(status(box)).toBe("The office is saved.");
    expect(input(box, "#office-name").value).toBe("Test Office");
    expect((box.querySelector("#office-private-policy") as HTMLSelectElement).value).toBe("drop");
    expect((box.querySelector("#office-automate") as HTMLSelectElement).value).toBe("on");
  });

  test("shows the time zone check and the command's error, and writes nothing", async () => {
    const device = await oneDevice();
    const box = mount(officePanel(), device);
    type(box, "#office-name", "Test Office");
    type(box, "#office-timezone", "Mars/Base");
    click(box, "#office-save");
    expect(status(box)).toContain("not a time zone");
    type(box, "#office-timezone", "Europe/London");
    type(box, "#office-day-start", "8am");
    click(box, "#office-save");
    expect(status(box)).toContain("HH:MM");
    expect(byId(device, "office", "office")).toBeUndefined();
    expect(input(box, "#office-day-start").value).toBe("8am");
  });
});

describe("People", () => {
  const modeSelect = (box: HTMLElement, id: string): HTMLSelectElement => box.querySelector(`tr[data-user='${id}'] select`) as HTMLSelectElement;

  test("lists each user by name with their mode, and says viewer mode is not a security control", async () => {
    const device = await oneDevice("admin");
    device.putUser({ id: "userb", name: "Blair Sample" });
    device.putUser({ id: "usera", name: "Alex Example", active: false });
    const box = mount(peoplePanel(), device);
    expect(box.textContent).toContain("hides the editing controls");
    expect(box.textContent).toContain("not a security control");
    const names = [...box.querySelectorAll("tbody tr")].map((tr) => (tr as HTMLTableRowElement).cells[0]!.textContent);
    expect(names).toEqual(["Alex Example", "Blair Sample"]);
    expect(modeSelect(box, "userb").value).toBe("assistant");
    expect((box.querySelector("tr[data-user='usera']") as HTMLTableRowElement).cells[1]!.textContent).toBe("Inactive");
  });

  test("changing the mode saves it with people.setMode and logs it", async () => {
    const device = await oneDevice("admin");
    device.putUser({ id: "userb", name: "Blair Sample" });
    const box = mount(peoplePanel(), device);
    const select = modeSelect(box, "userb");
    select.value = "viewer";
    select.dispatchEvent(new Event("change"));
    expect(byId(device, "people", idOf(device, "person", "userb"))).toMatchObject({ userId: "userb", mode: "viewer" });
    expect(rows(device, "log").map((r) => [r.area, r.kind])).toEqual([["setup", "mode-changed"]]);
    expect(status(box)).toBe("Blair Sample is now a viewer.");
    expect(modeSelect(box, "userb").value).toBe("viewer");
  });

  test("each mode select is named for its user", async () => {
    const device = await oneDevice("admin");
    device.putUser({ id: "userb", name: "Blair Sample" });
    const box = mount(peoplePanel(), device);
    expect(modeSelect(box, "userb").getAttribute("aria-label")).toBe("Mode for Blair Sample");
  });

  test("says when there are no users yet", async () => {
    const device = await oneDevice("admin");
    expect(mount(peoplePanel(), device).textContent).toContain("No users yet.");
  });
});

describe("Principals", () => {
  test("adds a principal with an upper-cased code and lists it", async () => {
    const device = await oneDevice();
    const box = mount(principalsPanel(), device);
    expect(box.textContent).toContain("No principals yet.");
    expect(box.textContent).toContain("cannot be changed once added");
    type(box, "#principal-new-code", "principal-a");
    type(box, "#principal-new-title", "Chair");
    click(box, "#principal-add");
    expect(rows(device, "principals")).toMatchObject([{ code: "PRINCIPAL-A", title: "Chair", order: 1, active: true }]);
    expect(box.querySelector("tr[data-principal='PRINCIPAL-A']")).not.toBeNull();
    expect(status(box)).toBe("PRINCIPAL-A is added.");
  });

  test("refuses a bad code, and shows the command's error for a duplicate", async () => {
    const device = await oneDevice();
    const box = mount(principalsPanel(), device);
    type(box, "#principal-new-code", "PRINCIPAL A");
    type(box, "#principal-new-title", "Chair");
    click(box, "#principal-add");
    expect(status(box)).toContain("letters, digits and hyphens");
    type(box, "#principal-new-code", "PRINCIPAL-A");
    click(box, "#principal-add");
    type(box, "#principal-new-code", "principal-a");
    type(box, "#principal-new-title", "Another");
    click(box, "#principal-add");
    expect(status(box)).toContain("already a principal");
    expect(rows(device, "principals")).toHaveLength(1);
  });

  test("each control in a principal's row is named for that principal", async () => {
    const device = await oneDevice();
    const box = mount(principalsPanel(), device);
    type(box, "#principal-new-code", "PRINCIPAL-A");
    type(box, "#principal-new-title", "Chair");
    click(box, "#principal-add");
    const names = [...box.querySelectorAll("tr[data-principal='PRINCIPAL-A'] input")].map((i) => i.getAttribute("aria-label"));
    expect(names).toEqual(["Title of PRINCIPAL-A", "Order of PRINCIPAL-A", "PRINCIPAL-A is active"]);
  });

  test("edits title, order and active in place; the code is not editable", async () => {
    const device = await oneDevice();
    const box = mount(principalsPanel(), device);
    type(box, "#principal-new-code", "PRINCIPAL-A");
    type(box, "#principal-new-title", "Chair");
    click(box, "#principal-add");
    const row = (): HTMLTableRowElement => box.querySelector("tr[data-principal='PRINCIPAL-A']") as HTMLTableRowElement;
    expect(row().cells[0]!.querySelector("input")).toBeNull();
    (row().querySelector("input[type=text]") as HTMLInputElement).value = "President";
    (row().querySelector("input[type=number]") as HTMLInputElement).value = "5";
    (row().querySelector("input[type=checkbox]") as HTMLInputElement).checked = false;
    (row().querySelector("button") as HTMLButtonElement).click();
    expect(rows(device, "principals")).toMatchObject([{ code: "PRINCIPAL-A", title: "President", order: 5, active: false }]);
    expect(status(box)).toBe("PRINCIPAL-A is saved.");
    (row().querySelector("button") as HTMLButtonElement).click();
    expect(status(box)).toBe("Nothing to save for PRINCIPAL-A.");
  });
});
