// Gate G11: size budgets, checked as the last step of `npm run build`.
// Reads the bootstrap page and the app bundle from dist/ and fails (exit 1)
// when either is at or over its budget. Sizes are uncompressed bytes.
//
//   node framework/build/size-budget.js [--dist <dir>] [--bootstrap-limit <bytes>] [--bundle-limit <bytes>]
//
// The limit flags exist so the check can be seen to fail; the budgets are not
// raised without Harry.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { appNames } from "../runtime/names.ts";
import definition from "./app-definition.js";

// The bundle budget was 500,000 until the diary calendar. FullCalendar 7 (forma
// flavour, time grid only) and temporal-polyfill added about 287,000 bytes,
// taking the bundle to 773,823. With every v0.1 screen, the iCalendar parser
// (about 76,000) and the shadcn components, the whole app is 1,178,591 bytes
// (343,687 gzipped). The project owner has said size is not a concern, so the
// budget is 1,400,000, which leaves about 220,000 bytes.
export const BUDGETS = { bootstrap: 50_000, bundle: 1_400_000 };

/** Size, limit and headroom of each build output. `dist` is laid out as the build writes it. */
export function checkBudgets({ dist, version, limits = BUDGETS }) {
  const files = {
    bootstrap: join(dist, "bootstrap.html"),
    bundle: join(dist, "app", appNames(definition).bundleFile(version)),
  };
  return Object.entries(files).map(([name, file]) => {
    if (!existsSync(file)) return { name, file, missing: true, over: true };
    const bytes = statSync(file).size;
    const limit = limits[name];
    return { name, file, bytes, limit, headroom: limit - bytes, over: bytes >= limit };
  });
}

const n = (bytes) => bytes.toLocaleString("en-GB");
const plural = (count) => `${n(count)} byte${count === 1 ? "" : "s"}`;

function report({ name, file, bytes, limit, headroom, missing }) {
  if (missing) return `${name.padEnd(10)}missing: ${file} (run the build first)`;
  const state = headroom > 0 ? `${plural(headroom)} headroom` : headroom === 0 ? "OVER BUDGET: at the limit, must be under it" : `OVER BUDGET by ${plural(-headroom)}`;
  return `${name.padEnd(10)}${n(bytes)} bytes of ${n(limit)}, ${state}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { dist: { type: "string" }, "bootstrap-limit": { type: "string" }, "bundle-limit": { type: "string" } } });
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const version = JSON.parse(readFileSync(join(root, "app", "package.json"), "utf8")).version;
  const limits = {
    bootstrap: Number(values["bootstrap-limit"] ?? BUDGETS.bootstrap),
    bundle: Number(values["bundle-limit"] ?? BUDGETS.bundle),
  };
  const results = checkBudgets({ dist: values.dist ?? join(root, "dist"), version, limits });
  console.log("Size budgets (uncompressed, must be under the limit):");
  for (const result of results) console.log(`  ${report(result)}`);
  if (results.some((r) => r.over)) {
    console.error("Size budget check failed.");
    process.exit(1);
  }
}
