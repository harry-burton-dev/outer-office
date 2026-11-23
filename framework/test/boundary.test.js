// Gate G5: app code imports only from the framework's public entry (spec S2, acceptance 4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findViolations, appPackages } from "../build/boundary.js";

const appDir = fileURLToPath(new URL("../../app/", import.meta.url));

test("the real app is clean", () => {
  assert.deepEqual(findViolations(appDir, { allowedPackages: appPackages(appDir) }), []);
});

test("app/package.json lists neither yjs nor a framework-internal path", () => {
  for (const name of appPackages(appDir)) {
    assert.notEqual(name, "yjs");
    assert.ok(!name.startsWith("@trellis/framework/"), name);
  }
});

test("rejects each kind of bad import", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "boundary-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "src", "deep"), { recursive: true });

  const bad = {
    "subpath.ts": `import { x } from "@trellis/framework/engine";`,
    "escape.ts": `import "../../framework/engine/src/engine/engine.js";`,
    "absolute.ts": `export { y } from "/home/someone/engine.js";`,
    "vite-alias.ts": `const m = await import("/@fs/framework/index.ts");`,
    "yjs.js": `const Y = require("yjs");`,
    "unlisted.tsx": `import * as Y from "lib0/encoding";`,
  };
  const good = {
    "entry.ts": `import { startHost } from "@trellis/framework";`,
    "own.tsx": `import { a } from "./entry";\nimport b from "@/deep/b";\nimport "./style.css?inline";`,
    "deep/b.ts": `import React from "react";\nimport { c } from "react-dom/client";\nexport default 1;`,
  };
  for (const [name, body] of Object.entries({ ...bad, ...good })) writeFileSync(join(dir, "src", name), body + "\n");

  const found = findViolations(dir, { allowedPackages: ["@trellis/framework", "react", "react-dom"] });
  const byFile = Object.groupBy(found, (v) => v.file.replace(/\\/g, "/"));
  assert.deepEqual(Object.keys(byFile).sort(), Object.keys(bad).map((n) => `src/${n}`).sort());
  for (const list of Object.values(byFile)) {
    assert.equal(list.length, 1);
    assert.equal(list[0].line, 1);
    assert.ok(list[0].reason);
  }
});

test("reports the line of a bad import", () => {
  const dir = mkdtempSync(join(tmpdir(), "boundary-"));
  try {
    writeFileSync(join(dir, "a.ts"), `import { a } from "@trellis/framework";\n\nimport { b } from "yjs";\n`);
    const [v] = findViolations(dir, { allowedPackages: ["@trellis/framework"] });
    assert.deepEqual(v, { file: "a.ts", line: 3, specifier: "yjs", reason: "package not listed in app/package.json" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tests, testing/ and spike/ are exempt, and shipped code may not import them", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "boundary-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const sub of ["src/testing", "src/spike"]) mkdirSync(join(dir, sub), { recursive: true });
  const escape = `import { x } from "../../framework/data/test/_world.js"; import { test } from "vitest";`;
  writeFileSync(join(dir, "src", "thing.test.ts"), escape);
  writeFileSync(join(dir, "src", "testing", "world.ts"), escape);
  writeFileSync(join(dir, "src", "spike", "check.js"), escape);
  writeFileSync(join(dir, "vitest.config.js"), `import { defineConfig } from "vitest/config";`);
  assert.deepEqual(findViolations(dir, { allowedPackages: [] }), []);

  writeFileSync(join(dir, "src", "shipped.ts"), `import { w } from "./testing/world"; import "@/spike/check"; import "./thing.test";`);
  const found = findViolations(dir, { allowedPackages: [] });
  assert.deepEqual(found.map((v) => v.reason), ["imports test-only code", "imports test-only code", "imports test-only code"]);
});

test("shipped code may not use the folder handle; tests and spikes may", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "boundary-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "src", "screens"), { recursive: true });
  mkdirSync(join(dir, "src", "spike"), { recursive: true });
  writeFileSync(
    join(dir, "src", "screens", "bad.tsx"),
    [
      `const dir = await root.getDirectoryHandle("automate", { create: true });`,
      `const file = await dir.getFileHandle("x.json");`,
      `const w = await file . createWritable ();`,
      `await dir.removeEntry("x.json");`,
      `const picked = await window.showDirectoryPicker();`,
    ].join("\n"),
  );
  writeFileSync(join(dir, "src", "screens", "good.tsx"), `const files = useSession().plainFiles("automate");\nawait files.write("calls/x.json", "{}");\n// getFileHandle is named in this comment, not called\n`);
  writeFileSync(join(dir, "src", "spike", "probe.ts"), `await root.getFileHandle("x", { create: true });`);
  writeFileSync(join(dir, "src", "screens", "bad.test.tsx"), `await root.getFileHandle("x");`);
  const found = findViolations(dir, { allowedPackages: [] });
  assert.deepEqual(
    found.map((v) => [v.file.replace(/\\/g, "/"), v.line, v.specifier]),
    [
      ["src/screens/bad.tsx", 1, "getDirectoryHandle"],
      ["src/screens/bad.tsx", 2, "getFileHandle"],
      ["src/screens/bad.tsx", 3, "createWritable"],
      ["src/screens/bad.tsx", 4, "removeEntry"],
      ["src/screens/bad.tsx", 5, "showDirectoryPicker"],
    ],
  );
  assert.ok(found.every((v) => v.reason === "uses the folder handle; use useSession().plainFiles"));
});
