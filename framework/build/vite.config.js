import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import repoDefinition from "./app-definition.js";
import { appNames } from "../runtime/names.ts";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const pkg = JSON.parse(readFileSync(here("../../app/package.json"), "utf8"));
const PUBLIC_KEY_FILE = here("../../app/signing-public-key.json");
const CONFIG_FILE = here("../../app/app.config.ts");

/** The admin's public key: TRELLIS_PUBLIC_KEY (JWK as JSON), else app/signing-public-key.json. */
function signingPublicKey() {
  const text = process.env.TRELLIS_PUBLIC_KEY ?? (existsSync(PUBLIC_KEY_FILE) ? readFileSync(PUBLIC_KEY_FILE, "utf8") : undefined);
  if (!text) throw new Error("The bootstrap needs the admin's public signing key: set TRELLIS_PUBLIC_KEY or add app/signing-public-key.json.");
  return JSON.stringify(JSON.parse(text));
}

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Puts the build's definition into the pages: %APP_NAME% in entry pages, and app/app.config.ts wherever it is imported. */
function definitionPlugin(definition) {
  return {
    name: "app-definition",
    enforce: "pre",
    transformIndexHtml: { order: "pre", handler: (html) => html.replaceAll("%APP_NAME%", escapeHtml(definition.name)) },
    load: (id) => (id === CONFIG_FILE ? `export default ${JSON.stringify(definition)};` : undefined),
  };
}

const ADMIN_PANELS = "virtual:admin-panels";
const RESOLVED_ADMIN_PANELS = "\0admin-panels";
const PANELS_MODULE = here("../runtime/admin/panels.ts");

/**
 * The admin page's "virtual:admin-panels": `panels`, the app's src/admin/index.ts
 * panels opened by the framework, or null when the app has no such file, so a
 * page without panels builds in neither them nor the data runtime.
 */
export function adminPanelsPlugin(file = here("../../app/src/admin/index.ts")) {
  const path = (p) => JSON.stringify(p.replace(/\\/g, "/"));
  const code = existsSync(file)
    ? `import { adminPanels } from ${path(file)};\nimport { openPanels } from ${path(PANELS_MODULE)};\nexport const panels = openPanels(adminPanels);`
    : "export const panels = null;";
  return {
    name: "admin-panels",
    resolveId: (id) => (id === ADMIN_PANELS ? RESOLVED_ADMIN_PANELS : undefined),
    load: (id) => (id === RESOLVED_ADMIN_PANELS ? code : undefined),
  };
}

// The app's admin panels reach the framework through its public entry, which
// also carries the React shell and hooks. The admin page renders neither, and
// nothing in them runs on import, so the admin build may leave them out unless used.
const UI_MODULE = /[\\/](?:framework[\\/](?:runtime[\\/]shell|react)|node_modules[\\/](?:react|react-dom|scheduler|@base-ui|@floating-ui|class-variance-authority|cn|use-sync-external-store|tabbable))[\\/]/;
export const adminSideEffects = (id) => !UI_MODULE.test(id);

// Build targets (ADR-0005 section 1), chosen with --mode:
//   bootstrap  <outDir>/bootstrap.html        one HTML file: the loader and the public signing key
//   app        <outDir>/app/<id>-<version>.js one ES module, styles included, run by the bootstrap
//   admin      <outDir>/admin.html            one HTML file: the admin page, without the loader (OUT-10),
//                                             with the app's src/admin/index.ts panels if it has that file
// `vite` (dev) serves masters/dev.html: the app directly, without the loader.
// Every name comes from `definition`; release.js renames bootstrap.html to <id>.html
// and admin.html to <id>-admin.html.
// The entry pages live in masters/ because the project's filing hook only
// accepts HTML documents there or in an epic folder.
export function appConfig({ definition, version, mode, outDir }) {
  const names = appNames(definition);
  const shared = {
    root: here("../../masters"),
    resolve: { alias: { "@": here("../../app/src"), "/@app": here("../../app/src"), "/@runtime": here("../runtime") } },
    define: {
      __APP__: JSON.stringify({ id: definition.id, name: definition.name }),
      __APP_VERSION__: JSON.stringify(version),
      __BUILT_AT__: JSON.stringify(new Date().toISOString()),
    },
    server: { fs: { allow: [here("../..")] }, open: "/dev.html" },
  };
  if (mode === "bootstrap") {
    return {
      ...shared,
      plugins: [definitionPlugin(definition), viteSingleFile()],
      define: { ...shared.define, __SIGNING_PUBLIC_KEY__: signingPublicKey() },
      build: { target: "es2022", outDir, emptyOutDir: false, rollupOptions: { input: here("../../masters/bootstrap.html") } },
    };
  }
  if (mode === "app") {
    return {
      ...shared,
      plugins: [definitionPlugin(definition), react(), tailwindcss()],
      define: { ...shared.define, "process.env.NODE_ENV": JSON.stringify("production") },
      build: {
        target: "es2022",
        outDir: `${outDir}/app`,
        emptyOutDir: true,
        // not Vite's library mode: that leaves ES modules unminified
        rollupOptions: {
          input: here("../../app/src/main.tsx"),
          preserveEntrySignatures: "exports-only",
          output: { format: "es", entryFileNames: names.bundleFile(version), codeSplitting: false },
        },
      },
    };
  }
  if (mode === "admin") {
    return {
      ...shared,
      plugins: [definitionPlugin(definition), adminPanelsPlugin(), viteSingleFile()],
      define: { ...shared.define, __APP_DEFINITION__: JSON.stringify(definition) },
      build: { target: "es2022", outDir, emptyOutDir: false, rollupOptions: { input: here("../../masters/admin.html"), treeshake: { moduleSideEffects: adminSideEffects } } },
    };
  }
  // dev also serves /admin.html, so a workspace can be set up without a build
  return {
    ...shared,
    plugins: [definitionPlugin(definition), adminPanelsPlugin(), react(), tailwindcss()],
    define: { ...shared.define, __APP_DEFINITION__: JSON.stringify(definition) },
  };
}

export default defineConfig(({ mode }) => appConfig({ definition: repoDefinition, version: pkg.version, mode, outDir: here("../../dist") }));
