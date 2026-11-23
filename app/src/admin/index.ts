// The app's sections on the admin page (see docs/guides/add-an-admin-panel.md).
// Importing the commands module defines every command for the admin page's data runtime.
import type { AdminPanel } from "@trellis/framework";
import { officePanel } from "./office-panel";
import { principalsPanel } from "./principals-panel";

export const adminPanels: readonly AdminPanel[] = [officePanel(), principalsPanel()];
