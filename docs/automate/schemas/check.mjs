// Checks a file a flow wrote against the automate schemas.
//   node docs/automate/schemas/check.mjs <file.json> [more.json ...]
// The schema is chosen from the file's kind (call, reply or event). A reply's
// result and an event's data are checked against their own schema too.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../app/package.json", import.meta.url));
const Ajv2020 = require("ajv/dist/2020").default;
const dir = new URL("./", import.meta.url);
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
for (const file of readdirSync(dir).filter((f) => f.endsWith(".schema.json"))) {
  ajv.addSchema(JSON.parse(readFileSync(new URL(file, dir), "utf8")), file);
}
const DATA = { "diary.fetch": "diary-payload.schema.json", "diary-sync": "diary-payload.schema.json" };

let failed = false;
for (const path of process.argv.slice(2)) {
  const doc = JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, ""));
  const checks = [[{ call: "notice", reply: "reply", event: "event" }[doc.kind] + ".schema.json", doc]];
  if (doc.kind === "reply" && doc.status === "ok" && DATA[doc.api]) checks.push([DATA[doc.api], doc.result]);
  if (doc.kind === "event" && DATA[doc.process]) checks.push([DATA[doc.process], doc.data]);
  if (doc.kind === "call" && doc.api === "diary.fetch") checks.push(["diary.fetch.input.schema.json", doc.input]);
  for (const [schema, value] of checks) {
    if (!ajv.getSchema(schema)) { console.log(`${path}: unknown kind ${doc.kind}`); failed = true; continue; }
    if (ajv.validate(schema, value)) console.log(`${path}: valid against ${schema}`);
    else { failed = true; for (const e of ajv.errors) console.log(`${path}: ${schema} ${e.instancePath || "/"} ${e.message}`); }
  }
}
process.exit(failed ? 1 : 0);
