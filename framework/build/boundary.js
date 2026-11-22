// Gate G5: app code may import only the framework's public entry, its own files,
// and packages listed in app/package.json. Run by framework/test/boundary.test.js.
import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const FRAMEWORK = "@trellis/framework";
const SOURCE = /\.(?:[mc]?[jt]s|[jt]sx)$/;
const SKIP = new Set(["node_modules", "dist"]);
// Tests, their helpers and spikes never ship, so they may import test tools and
// the framework's test fixtures. Shipped code may not import them (see check).
const NOT_SHIPPED_DIR = new Set(["testing", "spike"]);
const NOT_SHIPPED_FILE = /(?:\.test\.[mc]?[jt]sx?|^vitest\.config\.js)$/;
const NOT_SHIPPED_SPECIFIER = /(?:^|\/)(?:testing|spike)(?:\/|$)|\.test(?:\.|$)/;
// import/export ... from "x", import("x"), require("x"), import "x". Comments are scanned too,
// so a bad import in a comment fails safe.
// The lookbehind keeps a string that merely contains the word, such as "import" in a union type, from being read as a statement.
const SPECIFIER = /(?<!['"`.$])\b(?:(?:import|export)\s[^'";]*?\bfrom\s*|import\s*\(\s*|require\s*\(\s*|import\s*)(['"])([^'"\n]+)\1/dg;

/** Package names (dependencies and devDependencies) listed in `<appDir>/package.json`. */
export function appPackages(appDir) {
  const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
  return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
}

/** @returns {{ file: string, line: number, specifier: string, reason: string }[]} */
export function findViolations(appDir, { allowedPackages }) {
  const root = resolve(appDir);
  const allowed = new Set(allowedPackages);
  const found = [];
  for (const path of walk(root)) {
    const text = readFileSync(path, "utf8");
    for (const m of text.matchAll(SPECIFIER)) {
      const specifier = m[2];
      const reason = check(specifier, path, root, allowed);
      if (!reason) continue;
      const line = text.slice(0, m.indices[2][0]).split("\n").length;
      found.push({ file: relative(root, path).split(sep).join("/"), line, specifier, reason });
    }
  }
  return found;
}

function check(specifier, file, root, allowed) {
  const spec = specifier.replace(/[?#].*$/, "");
  if (spec === FRAMEWORK) return null;
  if (spec.startsWith(FRAMEWORK + "/")) return "framework subpath; import from @trellis/framework only";
  if ((spec.startsWith(".") || spec.startsWith("@/")) && NOT_SHIPPED_SPECIFIER.test(spec)) return "imports test-only code";
  if (spec.startsWith(".")) return inside(resolve(file, "..", spec), root) ? null : "relative path leaves app/";
  if (spec.startsWith("@/")) return inside(resolve(root, "src", spec.slice(2)), root) ? null : "@/ alias leaves app/";
  if (spec.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(spec) || spec.includes(":")) return "absolute path, URL or builtin";
  const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
  return allowed.has(name) ? null : "package not listed in app/package.json";
}

function inside(path, root) {
  const rel = relative(root, path);
  return !rel.startsWith("..") && !isAbsolute(rel);
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    if (entry.isDirectory() ? NOT_SHIPPED_DIR.has(entry.name) : NOT_SHIPPED_FILE.test(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (SOURCE.test(entry.name)) yield path;
  }
}
