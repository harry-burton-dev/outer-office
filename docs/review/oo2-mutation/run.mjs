// Plants each bug in mutants.json one at a time, runs the app's typecheck and
// test suite, puts the file back, and prints CAUGHT or MISSED with the tests
// that failed. Every planted bug should be CAUGHT.
//   node docs/review/oo2-mutation/run.mjs [M01 M02 ...]
// Planted bugs are read from mutants.json and every mutants-*.json here.
import { readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const out = fileURLToPath(new URL("./out.json", import.meta.url));
// mutants.json and any mutants-*.json beside it (one per issue, so threads don't edit one file).
const files = readdirSync(new URL("./", import.meta.url)).filter((f) => /^mutants(-.+)?\.json$/.test(f)).sort();
const mutants = files.flatMap((f) => JSON.parse(readFileSync(new URL(`./${f}`, import.meta.url), "utf8")));
const only = process.argv.slice(2);
let missed = 0;
for (const m of mutants) {
  if (only.length && !only.includes(m.id)) continue;
  const path = `${repo}${m.file}`;
  const original = readFileSync(path, "utf8");
  const count = original.split(m.find).length - 1;
  if (count !== 1) { console.log(m.id, `BAD-FIND (${count} matches)`); missed += 1; continue; }
  writeFileSync(path, original.replace(m.find, m.replace));
  let status = "MISSED", by = "";
  try {
    try { execSync("npx tsc -p app --noEmit", { cwd: repo, stdio: "pipe" }); } catch { status = "CAUGHT (typecheck)"; }
    if (status === "MISSED") {
      try { execSync(`npx vitest run --config app/vitest.config.js --reporter=json --outputFile=${out}`, { cwd: repo, stdio: "pipe" }); }
      catch {
        status = "CAUGHT";
        const report = JSON.parse(readFileSync(out, "utf8"));
        by = report.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === "failed").map((a) => a.title)).slice(0, 2).join(" | ");
      }
    }
  } finally {
    writeFileSync(path, original);
  }
  if (status === "MISSED") missed += 1;
  console.log(m.id, status, m.what, by ? `(${by})` : "");
}
rmSync(out, { force: true });
process.exit(missed === 0 ? 0 : 1);
