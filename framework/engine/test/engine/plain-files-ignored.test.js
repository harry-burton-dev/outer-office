// Plain files (OUT-53) live beside the encrypted data in automate/. The engine
// reads only data/ and status/, so it must neither read, report nor remove
// them, even while compacting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, json } from "./_harness.js";
import { createPlainFiles } from "../../../plainfiles/plain-files.ts";

test("files in automate/ are not read, reported or removed by sync", async () => {
  const w = await makeWorld({ options: { sealBytes: 1, compaction: { chunkThreshold: 3, minSnapshotAgeMs: 0, jitterMs: 0 } } });
  const a = await w.device("harry-aaaaaaaa");
  const b = await w.device("sam-bbbbbbbb");
  const files = createPlainFiles(w.folder.root, "automate");
  await files.writeJson("calls/6f1c2a9e.json", { kind: "call" });
  await files.write("inbox/diary-sync/PRINCIPAL-A/20261123T210000Z.json", "{ not json yet");
  // names that would mean something inside data/
  await files.write("000001.ywb", "junk");
  await files.write("data/notes/sam-bbbbbbbb/000001.ywb", "junk");

  for (let i = 0; i < 10; i++) {
    a.table("notes").getMap("m").set(`k${i}`, i);
    await w.run([a, b], 5000);
  }
  await w.run([a, b], 60000);

  assert.ok(w.folder.paths("data/notes/").some((p) => /\/snap-/.test(p)), "compaction ran");
  assert.deepEqual(w.folder.ops.filter((op) => op.path.startsWith("automate") && (op.type === "read" || op.type === "delete")), []);
  assert.deepEqual(json(a), json(b));
  for (const engine of [a, b]) {
    assert.deepEqual(engine.status().errors, []);
    assert.deepEqual(engine.status().unreadable, []);
  }
  assert.deepEqual((await files.list("calls")).map((f) => f.name), ["6f1c2a9e.json"]);
  assert.deepEqual((await files.read("inbox/diary-sync/PRINCIPAL-A/20261123T210000Z.json")).text, "{ not json yet");
  assert.equal((await files.read("data/notes/sam-bbbbbbbb/000001.ywb")).text, "junk");
});
