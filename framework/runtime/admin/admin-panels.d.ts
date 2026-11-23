// The app's admin panels, resolved by the build (framework/build/vite.config.js):
// openPanels(adminPanels) from app/src/admin/index.ts when the app has one, else null.
declare module "virtual:admin-panels" {
  export const panels: import("./panels").PanelOpener | null;
}
