// Builds the Parse JSON schemas in this folder from the schemas one level up.
// Power Automate's Parse JSON understands only a draft-04 subset (no $ref, no
// unevaluatedProperties, no if/then), and it fails the run on any mismatch.
// These copies keep only types and required fields, which is what the
// designer needs for dynamic content. The strict checks (versions, enums,
// patterns) stay with the orchestrator's own conditions and the app, so a bad
// notice gets a "rejected" reply rather than a failed run.
//
//   node docs/automate/schemas/power-automate/generate.mjs     rewrite the files
//
// app/src/automate/schemas.test.ts fails if the files here are out of date.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCHEMAS = new URL("../", import.meta.url);
const NAMES = ["notice", "reply", "event", "diary-payload", "principals", "diary.fetch.input"];
const DROPPED = new Set(["$ref", "$schema", "$id", "$defs", "unevaluatedProperties", "allOf", "not", "pattern",
  "minLength", "minimum", "minItems", "if", "then", "else", "oneOf", "enum", "const"]);

const load = (file) => JSON.parse(readFileSync(new URL(file, SCHEMAS), "utf8"));

function resolve(ref, root) {
  const [file, pointer = ""] = ref.split("#");
  const doc = file ? load(file) : root;
  let node = doc;
  for (const part of pointer.split("/").filter(Boolean)) node = node[part];
  return { node, root: doc };
}

function flatten(node, root) {
  if (Array.isArray(node)) return node.map((n) => flatten(n, root));
  if (!node || typeof node !== "object") return node;
  let out = {};
  if (node.$ref) { const r = resolve(node.$ref, root); out = flatten(r.node, r.root); }
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED.has(key)) continue;
    if (key === "properties") {
      out.properties = { ...out.properties, ...Object.fromEntries(Object.entries(value).map(([p, s]) => [p, flatten(s, root)])) };
    } else out[key] = flatten(value, root);
  }
  if ("const" in node) out.type ??= typeof node.const === "number" ? "integer" : "string";
  if (node.enum) out.type ??= "string";
  if (node.oneOf) out.type = [...new Set(node.oneOf.flatMap((s) => [].concat(s.type ?? [])))];
  return out;
}

/** The Parse JSON schemas, by file name. */
export function generate() {
  const files = {};
  for (const name of NAMES) {
    const source = load(`${name}.schema.json`);
    const schema = flatten(source, source);
    delete schema.additionalProperties;
    if (name === "reply") schema.properties.result = {};
    if (name === "event") {
      const payload = load("diary-payload.schema.json");
      schema.properties.data = flatten(payload, payload);
      schema.description = "A diary-sync event, with data typed as a diary payload.";
    }
    files[`${name}.json`] = JSON.stringify(schema, null, 2) + "\n";
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [file, text] of Object.entries(generate())) writeFileSync(new URL(file, import.meta.url), text);
}
