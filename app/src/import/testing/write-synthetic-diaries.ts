// Writes the synthetic diaries to a folder, dated around today, for importing in the dev server.
// npm run diaries [-- <folder>]   (default: samples/diaries)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { syntheticDiaries } from "./synthetic-diaries.ts";

const folder = process.argv[2] ?? "samples/diaries";
mkdirSync(folder, { recursive: true });
for (const { fileName, text } of syntheticDiaries(new Date())) {
  writeFileSync(join(folder, fileName), text);
  console.log(join(folder, fileName));
}
