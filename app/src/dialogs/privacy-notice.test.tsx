// The privacy notice: shown on a task screen until acknowledged, then never again.
import { afterEach, expect, test } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { AppFrame } from "@/app/app-frame";
import { cleanupApp, renderApp } from "@/app/testing/render-app";
import { rows } from "@/domain/commands/testing/world";

afterEach(cleanupApp);

const go = (name: string) => fireEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name }));

test("the notice shows on Tasks, acknowledges once, and does not come back", async () => {
  const app = await renderApp({ seed: (s) => s.principal("PRINCIPAL-A"), children: <AppFrame /> });
  go("Inbox");
  expect(await screen.findByRole("heading", { name: "Before you use Tasks" })).toBeTruthy();
  expect(screen.getByText(/everyone in this workspace shares one key/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "I understand" }));

  expect(rows(app.device, "people").find((p) => p.userId === "user-a")?.privacyAckAt).toBeTruthy();
  go("Calendar");
  go("Today");
  expect(screen.queryByRole("heading", { name: "Before you use Tasks" })).toBeNull();
  expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy();
});
