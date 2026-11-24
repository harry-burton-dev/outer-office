// The automate JSON Schemas from docs/automate/schemas, compiled with ajv, so
// tests can check what the client and the fake orchestrator write.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default;
const dir = new URL("../../../docs/automate/schemas/", import.meta.url);
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
for (const file of readdirSync(dir).filter((f) => f.endsWith(".schema.json"))) {
  ajv.addSchema(JSON.parse(readFileSync(new URL(file, dir), "utf8")), file);
}

/** The schema errors for `value`, or [] when it is valid. */
export function schemaErrors(schema, value) {
  return ajv.validate(schema, value) ? [] : ajv.errors.map((e) => `${e.instancePath || "/"} ${e.message}`);
}
