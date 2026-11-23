// Plain files (OUT-53) against the simulated OneDrive folder, with the faults a
// real folder shows a reader: half-arrived files, left-behind .crswap files,
// conflict copies and junk.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlainFiles } from "../plain-files.ts";
import { newWorld, writeFile } from "../../engine/test/sim/helpers.js";

const names = (files) => files.map((f) => f.name);

test("write, list, read and delete under the named folder", async () => {
  const { a } = newWorld();
  const files = createPlainFiles(a.root, "automate");
  assert.deepEqual(await files.list("calls"), []); // missing folder lists as empty
  await files.writeJson("calls/b.json", { n: 2 });
  await files.write("calls/a.json", '{"n":1}');
  await files.write("config/principals.json", "{}");

  const listed = await files.list("calls");
  assert.deepEqual(names(listed), ["a.json", "b.json"]);
  assert.equal(listed[0].path, "calls/a.json");
  assert.equal(typeof listed[0].size, "number");
  assert.deepEqual(await files.listDirs(), ["calls", "config"]);
  assert.deepEqual(await files.readJson("calls/b.json"), { ok: true, value: { n: 2 }, size: listed[1].size, lastModified: listed[1].lastModified });

  assert.equal(await files.delete("calls/a.json"), true);
  assert.equal(await files.delete("calls/a.json"), false);
  assert.deepEqual(await files.read("calls/a.json"), { ok: false, reason: "missing" });
  assert.deepEqual(await files.read("nowhere/a.json"), { ok: false, reason: "missing" });

  // everything is under automate/, nothing at the root
  const root = [];
  for await (const [name] of a.root.entries()) root.push(name);
  assert.deepEqual(root, ["automate"]);
});

test("writeJson is UTF-8 with no byte-order mark, and read drops one a writer added", async () => {
  const { world, a } = newWorld();
  const files = createPlainFiles(a.root, "automate");
  await files.writeJson("x.json", { s: "café" });
  const bytes = world.deviceFiles(a.id).get("automate/x.json");
  assert.notEqual(bytes[0], 0xef);
  assert.equal(new TextDecoder().decode(bytes), '{\n  "s": "café"\n}\n');

  await writeFile(a, "automate/bom.json", new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"s":"é"}')]));
  assert.deepEqual((await files.readJson("bom.json")).value, { s: "é" });
});

test("a file still arriving reads as incomplete, then as itself", async () => {
  const { world, a, b } = newWorld({ faults: { partialArrival: { probability: 1, durationMs: [5000, 5000] } } });
  const flow = createPlainFiles(a.root, "automate");
  const app = createPlainFiles(b.root, "automate");
  await flow.writeJson("replies/r.json", { callId: "r", status: "ok", result: { long: "x".repeat(200) } });
  await world.advance(0);
  assert.deepEqual(await app.readJson("replies/r.json"), { ok: false, reason: "incomplete" });
  await world.advance(5000);
  const done = await app.readJson("replies/r.json");
  assert.equal(done.ok, true);
  assert.equal(done.value.callId, "r");
});

test("left-behind .crswap files and OneDrive junk are not listed", async () => {
  const { world, a, b } = newWorld({ seed: 7, faults: { crswap: { probability: 1, leftBehindProbability: 1 }, junk: { probability: 1 } } });
  const writer = createPlainFiles(a.root, "automate");
  for (let i = 0; i < 5; i++) await writer.writeJson(`calls/c${i}.json`, { i });
  await world.quiesce();
  const all = [...world.deviceFiles(b.id).keys()].filter((p) => p.startsWith("automate/calls/"));
  assert.ok(all.some((p) => p.endsWith(".crswap")), "the fault left a .crswap behind");
  assert.ok(all.length > 5, "the fault added junk");
  const listed = await createPlainFiles(b.root, "automate").list("calls");
  assert.deepEqual(names(listed), ["c0.json", "c1.json", "c2.json", "c3.json", "c4.json"]);
});

test("a conflict copy is listed beside the original and reads as its own file", async () => {
  const { world, a, b } = newWorld({ faults: { uploadLagMs: 100, downloadLagMs: 10_000, conflictCopy: { probability: 1 } } });
  await createPlainFiles(a.root, "automate").writeJson("calls/x.json", { callId: "x", from: "a" });
  await world.advance(100);
  await createPlainFiles(b.root, "automate").writeJson("calls/x.json", { callId: "x", from: "b" });
  await world.advance(200);
  await world.quiesce();
  const files = createPlainFiles(a.root, "automate");
  const listed = await files.list("calls");
  assert.equal(listed.length, 2);
  const values = await Promise.all(listed.map(async (f) => (await files.readJson(f.path)).value));
  // identity comes from inside the file, never from its name
  assert.deepEqual(values.map((v) => v.callId), ["x", "x"]);
  assert.deepEqual(values.map((v) => v.from).sort(), ["a", "b"]);
});

test("a read the folder refuses is unreadable, and works on the next try", async () => {
  const { world, a, b } = newWorld({ faults: { readFailure: { probability: 1 } } });
  await createPlainFiles(a.root, "automate").write("f.json", "{}");
  await world.advance(0);
  const app = createPlainFiles(b.root, "automate");
  assert.deepEqual(await app.read("f.json"), { ok: false, reason: "unreadable" });
  assert.equal((await app.read("f.json")).ok, true);
  assert.ok(world.log.some((e) => e.detail === "readFailure"));
});

test("folder names and paths are checked", async () => {
  const { a } = newWorld();
  for (const bad of ["", "Automate", "data", "status", "app", "backups", "a/b", "-x"]) {
    assert.throws(() => createPlainFiles(a.root, bad), TypeError, bad);
  }
  const files = createPlainFiles(a.root, "automate");
  for (const bad of ["", "../x.json", "a//b.json", "a/./b.json", "2026-11-23T21:00:00Z.json", "x.json.", " x.json", "a\\b.json", "what?.json"]) {
    await assert.rejects(() => files.write(bad, "x"), TypeError, bad);
  }
});
