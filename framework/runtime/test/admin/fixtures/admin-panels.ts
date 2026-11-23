// A stand-in app admin module for admin-build.test.js. It imports a value from
// the public entry, as app code does, so the build shows the shell is left out.
import { appNames, type AdminPanel } from "../../../../index.ts";

export const adminPanels: readonly AdminPanel[] = [
  { title: "Stand-in", render: (ctx) => ctx.el("p", {}, `stand-in panel drawn for ${appNames({ id: "x", name: "X" }).title}`) },
];
