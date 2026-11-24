import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createAutomateClient } from "../client.js";
import { replyProblem } from "../protocol.js";
import { schemaErrors } from "./schemas.js";
import { MINUTE, SECOND, automateDir, automateFiles, cloudFolder, run, setup, writeText } from "./helpers.js";

const fetchInput = { principal: "PRINCIPAL-A", windowStart: "2026-11-16T00:00:00Z", windowEnd: "2027-02-23T00:00:00Z" };

test("call writes one notice, with its data inline and times to the second", async () => {
  const { world, client } = await setup();
  await world.advance(1234); // a time with milliseconds in it
  const record = await client.call("diary.fetch", fetchInput);
  await world.quiesce();
  const calls = cloudFolder(world, "calls");
  assert.deepEqual(Object.keys(calls), [`${record.callId}.json`]);
  const notice = JSON.parse(calls[`${record.callId}.json`]);
  assert.deepEqual(notice, {
    protocol: "outer-office/automate",
    version: 1,
    kind: "call",
    callId: record.callId,
    api: "diary.fetch",
    apiVersion: 1,
    input: fetchInput,
    caller: { user: "sam", app: "outer-office test" },
    issuedAt: "2026-01-05T09:00:01Z",
    expiresAt: "2026-01-05T09:15:01Z",
  });
  assert.equal(record.status, "pending");
  assert.deepEqual(schemaErrors("notice.schema.json", notice), []);
});

test("call refuses a bad API name, version or input", async () => {
  const { client } = await setup();
  await assert.rejects(client.call("Diary.Fetch", {}), TypeError);
  await assert.rejects(client.call("diary.fetch", {}, { apiVersion: 0 }), TypeError);
  await assert.rejects(client.call("diary.fetch", []), TypeError);
});

test("a reply settles its call once, with the result, and every file is cleaned up", async () => {
  const s = await setup();
  const { callId } = await s.client.call("diary.fetch", fetchInput);
  const out = await run(s.world, 5 * MINUTE, s);
  assert.equal(out.settled.length, 1);
  assert.equal(out.settled[0].callId, callId);
  assert.equal(out.settled[0].status, "done");
  assert.deepEqual(out.settled[0].result, { ...fetchInput, count: 0, events: [], masters: [] });
  assert.equal(s.client.records.get(callId).status, "done");
  assert.equal("result" in s.client.records.get(callId), false, "records keep status, not the result");
  await s.world.quiesce();
  assert.deepEqual(cloudFolder(s.world, "calls"), {});
  assert.deepEqual(cloudFolder(s.world, "replies"), {});
});

test("rejected and error replies settle as rejected and failed, with the flow's error", async () => {
  const s = await setup({ apis: { "diary.fetch@1": () => { throw new Error("Unknown principal X"); } } });
  const unknown = await s.client.call("nope", {});
  const failing = await s.client.call("diary.fetch", fetchInput);
  const out = await run(s.world, 5 * MINUTE, s);
  const byId = Object.fromEntries(out.settled.map((r) => [r.callId, r]));
  assert.equal(byId[unknown.callId].status, "rejected");
  assert.equal(byId[unknown.callId].error.code, "unknown-api");
  assert.equal(byId[failing.callId].status, "failed");
  assert.deepEqual(byId[failing.callId].error, { code: "child-failed", message: "Unknown principal X" });
});

test("with no flow running, a call times out after expiresAt plus grace, and its notice is deleted", async () => {
  const s = await setup();
  const { callId } = await s.client.call("diary.fetch", fetchInput);
  const early = await run(s.world, 19 * MINUTE, { client: s.client });
  assert.equal(early.timedOut.length, 0, "not before 15 + 5 minutes");
  const late = await run(s.world, 2 * MINUTE, { client: s.client });
  assert.deepEqual(late.timedOut.map((r) => [r.callId, r.status]), [[callId, "timed-out"]]);
  await s.world.quiesce();
  assert.deepEqual(cloudFolder(s.world, "calls"), {});
});

test("a reply that arrives after the timeout is deleted and does not settle the call again", async () => {
  const s = await setup();
  const { callId } = await s.client.call("diary.fetch", fetchInput);
  await run(s.world, 21 * MINUTE, { client: s.client });
  const flowDir = await automateDir(s.flow);
  const reply = { protocol: "outer-office/automate", version: 1, kind: "reply", callId, api: "diary.fetch", apiVersion: 1, status: "ok", result: {}, error: null, handledFor: null, completedAt: "2026-01-05T09:30:00Z" };
  await writeText(flowDir, "replies", `${callId}.json`, JSON.stringify(reply));
  const out = await run(s.world, 2 * MINUTE, { client: s.client });
  assert.deepEqual(out.settled, []);
  assert.equal(s.client.records.get(callId).status, "timed-out");
  await s.world.quiesce();
  assert.deepEqual(cloudFolder(s.world, "replies"), {});
});

test("conflict copies of a reply settle the call once, and all copies are deleted", async () => {
  const s = await setup();
  const { callId } = await s.client.call("diary.fetch", fetchInput);
  const flowDir = await automateDir(s.flow);
  const reply = JSON.stringify({ protocol: "outer-office/automate", version: 1, kind: "reply", callId, status: "ok", result: { n: 1 }, error: null, completedAt: "2026-01-05T09:01:00Z" });
  await writeText(flowDir, "replies", `${callId}.json`, reply);
  await writeText(flowDir, "replies", `${callId}-LAPTOP.json`, reply);
  const out = await run(s.world, 2 * MINUTE, { client: s.client });
  assert.equal(out.settled.length, 1);
  await s.world.quiesce();
  assert.deepEqual(cloudFolder(s.world, "replies"), {});
});

test("a reply that does not parse yet is left for the next tick", async () => {
  const s = await setup();
  const { callId } = await s.client.call("diary.fetch", fetchInput);
  const flowDir = await automateDir(s.flow);
  const reply = JSON.stringify({ protocol: "outer-office/automate", version: 1, kind: "reply", callId, status: "ok", result: null, error: null, completedAt: "2026-01-05T09:01:00Z" });
  await writeText(flowDir, "replies", `${callId}.json`, reply.slice(0, 40));
  const first = await run(s.world, MINUTE, { client: s.client });
  assert.deepEqual(first.settled, []);
  assert.equal(Object.keys(cloudFolder(s.world, "replies")).length, 1, "the half file is not deleted");
  await writeText(flowDir, "replies", `${callId}.json`, reply);
  const second = await run(s.world, MINUTE, { client: s.client });
  assert.equal(second.settled.length, 1);
});

test("a reply that parses but breaks the schema fails the call as bad-reply", async () => {
  const s = await setup();
  const { callId } = await s.client.call("diary.fetch", fetchInput);
  const flowDir = await automateDir(s.flow);
  await writeText(flowDir, "replies", `${callId}.json`, JSON.stringify({ protocol: "outer-office/automate", version: 1, kind: "reply", callId, status: "ok", result: 1, error: "oops", completedAt: "2026-01-05T09:01:00Z" }));
  const out = await run(s.world, MINUTE, { client: s.client });
  assert.equal(out.settled[0].status, "failed");
  assert.equal(out.settled[0].error.code, "bad-reply");
});

test("a reply for a call this device does not know is left alone for 48 hours, then deleted", async () => {
  const s = await setup();
  const flowDir = await automateDir(s.flow);
  const callId = "bbbbbbbb-0000-4000-8000-000000000001";
  await writeText(flowDir, "replies", `${callId}.json`, JSON.stringify({ protocol: "outer-office/automate", version: 1, kind: "reply", callId, status: "ok", result: null, error: null, completedAt: "2026-01-05T09:00:00Z" }));
  await writeText(flowDir, "replies", "junk.json", "not json");
  await run(s.world, 47 * 60 * MINUTE, { client: s.client });
  assert.equal(Object.keys(cloudFolder(s.world, "replies")).length, 2);
  await run(s.world, 2 * 60 * MINUTE, { client: s.client });
  await s.world.quiesce();
  assert.deepEqual(cloudFolder(s.world, "replies"), {});
});

test("two devices: each settles only its own calls", async () => {
  const s = await setup();
  const other = s.world.addDevice("bob-bbbbbbbb");
  const bob = createAutomateClient({
    files: automateFiles(other),
    caller: { user: "bob", app: "outer-office test" },
    now: s.now,
    newId: () => "bbbbbbbb-0000-4000-8000-000000000001",
  });
  const mine = await s.client.call("diary.fetch", fetchInput);
  const theirs = await bob.call("diary.fetch", fetchInput);
  const settled = { app: [], bob: [] };
  for (let i = 1; i <= 12; i++) {
    await s.world.advance(30 * SECOND);
    if (i % 4 === 0) await s.orchestrator.sweep();
    settled.app.push(...(await s.client.tick()).settled.map((r) => r.callId));
    settled.bob.push(...(await bob.tick()).settled.map((r) => r.callId));
  }
  assert.deepEqual(settled.app, [mine.callId]);
  assert.deepEqual(settled.bob, [theirs.callId]);
});

test("replyProblem accepts the spec's sample replies and names what is wrong otherwise", () => {
  const ok = { protocol: "outer-office/automate", version: 1, kind: "reply", callId: "6f1c2a9e-0000-4000-8000-000000000000", api: "diary.fetch", apiVersion: 1, status: "ok", result: { any: 1 }, error: null, handledFor: "sam@office.example", completedAt: "2026-11-23T20:33:10Z" };
  assert.equal(replyProblem(ok), null);
  assert.deepEqual(schemaErrors("reply.schema.json", ok), [], "the schema agrees");
  assert.equal(replyProblem({ ...ok, status: "rejected", result: null, error: { code: "unknown-api", message: "No API" } }), null);
  assert.match(replyProblem({ ...ok, extra: 1 }), /unexpected field/);
  assert.match(replyProblem({ ...ok, callId: "6F1C2A9E-0000-4000-8000-000000000000" }), /callId/);
  assert.match(replyProblem({ ...ok, completedAt: "2026-11-23 20:33" }), /completedAt/);
  assert.match(replyProblem({ ...ok, status: "error", result: null, error: { code: "x" } }), /error is not/);
  assert.match(replyProblem({ ...ok, status: "done" }), /status/);
});

test("replyProblem agrees with the protocol's reply examples, valid and invalid", () => {
  const examples = new URL("../../../docs/automate/examples/", import.meta.url);
  const read = (path) => JSON.parse(readFileSync(new URL(path, examples), "utf8"));
  const valid = readdirSync(examples).filter((f) => f.startsWith("reply-"));
  const invalid = readdirSync(new URL("invalid/", examples)).filter((f) => f.startsWith("reply-"));
  assert.ok(valid.length > 0 && invalid.length > 0);
  for (const f of valid) assert.equal(replyProblem(read(f)), null, f);
  for (const f of invalid) {
    const { _why, ...reply } = read(`invalid/${f}`);
    assert.notEqual(replyProblem(reply), null, `${f}: ${_why}`);
  }
});
