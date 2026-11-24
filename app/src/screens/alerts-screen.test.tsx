// Alerts (OUT-86): built-in rules with switch, amount, surfaces and the
// last-week preview; own rules; cover; who is watching.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { CommandDef } from "@trellis/framework";
import { ruleSettingSet } from "@/domain/commands";
import { RULES } from "@/domain/rules";
import { cleanupApp, NOW, renderApp, type Seeder } from "@/app/testing/render-app";
import { AlertsScreen } from "./alerts-screen";
import { HomeScreen } from "./home-screen";

afterEach(cleanupApp);

const putLog: CommandDef<{ principal: string; kind: string; event: string; at: string }, string> = {
  name: "test.putLog",
  handler: (tx, row) => {
    const id = tx.newId();
    tx.put("log", id, { by: "user-b", area: "calendar", task: "", from: "2026-11-24T14:00:00Z", to: "2026-11-25T14:00:00Z", note: "", ...row });
    return id;
  },
};

function seed(s: Seeder): string {
  s.user("user-a", "Alex");
  s.user("user-b", "Blake");
  const principal = s.principal("PRINCIPAL-A", { title: "Minister" });
  s.run(putLog, { principal, kind: "moved", event: "e1", at: "2026-11-22T07:00:00.000Z" });
  return principal;
}

const rule = (id: string) => screen.getByTestId(`rule-${id}`);

test("a rule switched off on Alerts stops posting on Home; its preview still shows what it would have", async () => {
  await renderApp({ seed: (s) => void seed(s), children: <><AlertsScreen /><HomeScreen /></> });
  const home = () => within(screen.getByRole("region", { name: "PRINCIPAL-A · Minister" })).queryAllByTestId("update");
  expect(home()).toHaveLength(1);
  expect(within(rule("moved")).getByText("What this would have shown last week: 1")).toBeTruthy();
  fireEvent.click(within(rule("moved")).getByRole("switch"));
  fireEvent.click(within(rule("short-notice")).getByRole("switch"));
  expect(home()).toHaveLength(0);
  expect(within(rule("moved")).getByText("What this would have shown last week: 1")).toBeTruthy();
});

test("an amount out of range is refused with the reason; surfaces save as ticked", async () => {
  await renderApp({ seed: (s) => void seed(s), children: <AlertsScreen /> });
  const amount = within(rule("prep-due")).getByRole("spinbutton");
  fireEvent.change(amount, { target: { value: "0" } });
  fireEvent.blur(amount);
  expect(within(rule("prep-due")).getByText(/from 1 to 336/)).toBeTruthy();
  const badge = within(rule("added")).getByRole("checkbox", { name: "Badge" });
  fireEvent.click(badge);
  expect(within(rule("added")).getByRole("checkbox", { name: "Badge" }).getAttribute("aria-checked")).toBe("true");
});

test("a user makes a rule of their own and removes it", async () => {
  await renderApp({ seed: (s) => void seed(s), children: <AlertsScreen /> });
  const form = screen.getByRole("form", { name: "New rule" });
  fireEvent.change(within(form).getByRole("textbox"), { target: { value: "Minister's moves" } });
  fireEvent.change(within(form).getAllByRole("combobox")[0], { target: { value: "moved" } });
  fireEvent.click(within(form).getByRole("button", { name: "Add rule" }));
  const mine = await screen.findByTestId("own-rule");
  expect(mine.textContent).toMatch(/Minister's moves.*A meeting moves · all principals · for information/);
  expect(within(mine).getByText("What this would have shown last week: 1")).toBeTruthy();
  fireEvent.click(within(mine).getByRole("button", { name: "Remove" }));
  expect(screen.queryByTestId("own-rule")).toBeNull();
});

test("who is watching warns for a principal nobody watches (B30), and cover counts", async () => {
  await renderApp({
    seed: (s) => {
      seed(s);
      for (const r of RULES.filter((x) => x.lane === "needs")) s.run(ruleSettingSet, { now: NOW, rule: r.id, on: false });
    },
    user: "user-a",
    children: <AlertsScreen />,
  });
  const line = () => screen.getByTestId("coverage").textContent ?? "";
  expect(line()).toMatch(/Blake/);
  expect(line()).not.toMatch(/Alex/);
  const form = screen.getByRole("form", { name: "New cover" });
  const [, away, covering] = within(form).getAllByRole("combobox");
  fireEvent.change(away, { target: { value: "user-b" } });
  fireEvent.change(covering, { target: { value: "user-a" } });
  fireEvent.click(within(form).getByRole("button", { name: "Set cover" }));
  expect((await screen.findByTestId("cover")).textContent).toMatch(/Alex covers Blake for PRINCIPAL-A.*now/);
});
