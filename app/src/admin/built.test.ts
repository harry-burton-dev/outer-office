// @vitest-environment node
// The built admin page carries this app's panels.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { build, type InlineConfig } from "vite";
import { appConfig } from "../../../framework/build/vite.config.js";
import definition from "../../../framework/build/app-definition.js";

const outDir = mkdtempSync(join(tmpdir(), "app-admin-"));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

test("dist admin.html has the Office, Principals and People sections", async () => {
  // appConfig is JavaScript, so its inferred type is looser than Vite's.
  const config = appConfig({ definition, version: "0.0.0", mode: "admin", outDir }) as unknown as InlineConfig;
  await build({ ...config, configFile: false, logLevel: "error" });
  const html = readFileSync(join(outDir, "admin.html"), "utf8");
  for (const marker of ["office-save", "office-timezone", "principal-add", "principal-new-code", "sync to every user", "office.save", "principal.save", "people.setMode", "not a security control"]) {
    expect(html, marker).toContain(marker);
  }
}, 60_000);
