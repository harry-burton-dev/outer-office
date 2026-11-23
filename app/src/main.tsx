import { mount, TrellisApp } from "@trellis/framework";
import config from "../app.config";
import css from "./index.css?inline";
// Defines every app command with the framework, so each can run by name.
import "@/domain/commands";
import { AppProvider } from "@/app/app-state";
import { AppFrame } from "@/app/app-frame";

export const start = mount(
  <TrellisApp config={config} chrome="app">
    <AppProvider>
      <AppFrame />
    </AppProvider>
  </TrellisApp>,
  css,
);
