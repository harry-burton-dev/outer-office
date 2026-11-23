// @vitest-environment node
// The automate protocol's schemas (docs/automate/schemas) and the examples the
// flows are built from (docs/automate/examples) must agree, and the Power
// Automate copies must be current. See docs/automate/README.md.
import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import Ajv04Like from "ajv";

const DOCS = fileURLToPath(new URL("../../../docs/automate/", import.meta.url));
const SCHEMAS = join(DOCS, "schemas");
const EXAMPLES = join(DOCS, "examples");
const PA = join(SCHEMAS, "power-automate");

const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const jsonFiles = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

const strict = new Ajv2020({ strict: true, allowUnionTypes: true, allErrors: true });
for (const file of jsonFiles(SCHEMAS)) strict.addSchema(json(join(SCHEMAS, file)) as object, file);

/** Which schema an example is checked against, from its file name. */
function schemaFor(file: string): string {
  const prefix = ["notice", "reply", "event", "diary-payload", "principals"].find((p) => file.startsWith(p));
  if (!prefix) throw new Error(`no schema for example ${file}`);
  return `${prefix}.schema.json`;
}

const errorsOf = (schema: string, doc: unknown) =>
  strict.validate(schema, doc) ? [] : (strict.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);

describe("automate schemas", () => {
  test("every schema compiles in strict mode", () => {
    for (const file of jsonFiles(SCHEMAS)) expect(() => strict.getSchema(file), file).not.toThrow();
  });

  test.each(jsonFiles(EXAMPLES))("example %s is valid", (file) => {
    expect(errorsOf(schemaFor(file), json(join(EXAMPLES, file)))).toEqual([]);
  });

  test.each(jsonFiles(join(EXAMPLES, "invalid")))("invalid/%s is rejected", (file) => {
    const { _why, ...doc } = json(join(EXAMPLES, "invalid", file)) as { _why: string };
    expect(_why, "each invalid example says why").toBeTruthy();
    expect(errorsOf(schemaFor(file), doc)).not.toEqual([]);
  });

  test("the inline data in calls, replies and events matches its own schema", () => {
    const notice = json(join(EXAMPLES, "notice-diary-fetch.json")) as { input: unknown };
    expect(errorsOf("diary.fetch.input.schema.json", notice.input)).toEqual([]);
    const reply = json(join(EXAMPLES, "reply-diary-fetch-ok.json")) as { result: unknown };
    expect(errorsOf("diary-payload.schema.json", reply.result)).toEqual([]);
    const event = json(join(EXAMPLES, "event-diary-sync.json")) as { data: unknown };
    expect(errorsOf("diary-payload.schema.json", event.data)).toEqual([]);
  });

  test("a diary payload's count is its number of events, and every series has a master", () => {
    const payload = json(join(EXAMPLES, "diary-payload.json")) as {
      count: number; events: { seriesMasterId: string | null }[]; masters: { id: string }[];
    };
    expect(payload.count).toBe(payload.events.length);
    const masters = new Set(payload.masters.map((m) => m.id));
    for (const e of payload.events) if (e.seriesMasterId) expect(masters.has(e.seriesMasterId)).toBe(true);
  });
});

describe("Power Automate Parse JSON schemas", () => {
  test("are current: run node docs/automate/schemas/power-automate/generate.mjs", async () => {
    const generator = join(PA, "generate.mjs");
    const { generate } = (await import(/* @vite-ignore */ generator)) as { generate: () => Record<string, string> };
    for (const [file, text] of Object.entries(generate())) expect(readFileSync(join(PA, file), "utf8"), file).toBe(text);
  });

  test("hold no keyword Parse JSON does not understand", () => {
    for (const file of jsonFiles(PA)) {
      const text = readFileSync(join(PA, file), "utf8");
      for (const keyword of ["$ref", "$schema", "unevaluatedProperties", "\"if\"", "\"const\"", "oneOf"]) {
        expect(text.includes(keyword), `${file} has ${keyword}`).toBe(false);
      }
    }
  });

  test.each(jsonFiles(EXAMPLES).filter((f) => !f.startsWith("principals")))("accept example %s", (file) => {
    const loose = new Ajv04Like({ strict: false });
    const pa = file.startsWith("diary-payload") ? "diary-payload.json" : `${schemaFor(file).replace(".schema", "")}`;
    expect(loose.validate(json(join(PA, pa)) as object, json(join(EXAMPLES, file)))).toBe(true);
  });
});
