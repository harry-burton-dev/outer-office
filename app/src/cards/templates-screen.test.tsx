import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { tagSave, templateSave } from "@/domain/commands";
import { cleanupApp, renderApp } from "@/app/testing/render-app";
import { TemplatesScreen } from "./templates-screen";

afterEach(cleanupApp);

test("a tab template is made on the Templates screen: name, cards in order, and tasks", async () => {
  const app = await renderApp({
    seed: (s) => {
      s.run(templateSave, { now: "2026-11-22T09:00:00.000Z", name: "Contact", fields: [{ id: "who", label: "Who", type: "text" }] });
      s.run(templateSave, { now: "2026-11-22T09:00:00.000Z", name: "Dial-in", fields: [{ id: "num", label: "Number", type: "phone" }] });
      s.run(tagSave, { now: "2026-11-22T09:00:00.000Z", name: "Board" });
    },
    children: <TemplatesScreen />,
  });
  fireEvent.change(screen.getByRole("textbox", { name: "New tab" }), { target: { value: "Board meeting" } });
  fireEvent.click(screen.getByRole("button", { name: "Add tab" }));
  const tab = await screen.findByRole("region", { name: "Board meeting" });
  expect(within(tab).getByText("Not used in the last 90 days.")).toBeTruthy();
  fireEvent.click(within(tab).getByRole("button", { name: "Add a card" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Dial-in" }));
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  fireEvent.click(within(tab).getByRole("button", { name: "Add a card" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Contact" }));
  expect(within(within(tab).getByRole("list", { name: "Board meeting cards" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Dial-in", "Contact"]);
  fireEvent.click(within(tab).getByRole("button", { name: "Add a task" }));
  fireEvent.change(within(tab).getByRole("textbox", { name: "Task" }), { target: { value: "Send the papers" } });
  fireEvent.change(within(tab).getByRole("spinbutton", { name: "Days before" }), { target: { value: "3" } });
  fireEvent.click(within(tab).getByRole("button", { name: "Save the tasks" }));
  const trigger = within(tab).getByRole("combobox", { name: "Trigger" }) as HTMLSelectElement;
  fireEvent.change(trigger, { target: { value: [...trigger.options].find((o) => o.text === "Tag: Board")!.value } });
  const stored = app.device.data.view("tabTemplates").rows()[0] as { tasks?: string; triggerKind?: string };
  expect(JSON.parse(stored.tasks ?? "[]")).toEqual([{ title: "Send the papers", daysBefore: 3, owner: "" }]);
  expect(stored.triggerKind).toBe("tag");
});
