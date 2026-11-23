// The fake orchestrator passes the checklist the real flow must pass (F3 section 4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCases, diaryFetchStub } from "../testing/conformance.js";
import { answerable } from "../testing/fake-orchestrator.js";
import { replyProblem } from "../protocol.js";
import { MINUTE, automateDir, cloudFolder, run, sequentialIds, setup, writeText } from "./helpers.js";

async function dropAll(s, cases) {
  const dir = await automateDir(s.app);
  for (const c of cases) for (const f of c.files) await writeText(dir, "calls", f.name, f.text);
  await s.world.quiesce();
}

const casesFor = (s) => buildCases({ now: s.now(), principal: "PRINCIPAL-A", newId: sequentialIds("c") });

test("all ten cases dropped at once: each gets exactly the reply it should", async () => {
  const s = await setup();
  const cases = casesFor(s);
  await dropAll(s, cases);
  await run(s.world, 5 * MINUTE, { orchestrator: s.orchestrator });
  await s.world.quiesce();

  const replies = cloudFolder(s.world, "replies");
  const expected = cases.filter((c) => c.reply);
  assert.deepEqual(Object.keys(replies).sort(), expected.map((c) => `${c.callId}.json`).sort());
  for (const c of expected) {
    const reply = JSON.parse(replies[`${c.callId}.json`]);
    assert.equal(replyProblem(reply), null, c.id);
    assert.equal(reply.status, c.reply.status, c.id);
    assert.equal(reply.error?.code ?? null, c.reply.code, c.id);
    assert.equal("api" in reply && "apiVersion" in reply, c.reply.echoesApi, `${c.id}: api and apiVersion echoed`);
    if (c.reply.echoesApi) assert.equal(reply.apiVersion, 1, `${c.id}: apiVersion is a number`);
  }
  const ok = JSON.parse(replies[`${cases[0].callId}.json`]);
  assert.equal(typeof ok.result, "object", "C1: result is an object, not text");
  assert.equal(JSON.parse(replies[`${cases.find((c) => c.id === "C7").callId}.json`]).error.message, "No mailbox for this principal");

  const left = Object.keys(cloudFolder(s.world, "calls")).sort();
  const lingering = cases.filter((c) => c.staysFor !== "answered").flatMap((c) => c.files.map((f) => f.name)).sort();
  assert.deepEqual(left, lingering, "at 5 minutes only C6, C8 and C10 are left");
  assert.equal(Object.keys(cloudFolder(s.world, "config")).length, 0, "C10 wrote nothing outside replies/");

  await run(s.world, 15 * MINUTE, { orchestrator: s.orchestrator });
  await s.world.quiesce();
  assert.deepEqual(Object.keys(cloudFolder(s.world, "calls")), ["c8.json.crswap"], "by 20 minutes only C8 is left");
});

test("C2: both copies in one sweep run the child flow once", async () => {
  let runs = 0;
  const stub = diaryFetchStub();
  const s = await setup({ apis: { "diary.fetch@1": (input) => (runs++, stub(input)) } });
  await dropAll(s, casesFor(s).filter((c) => c.id === "C2"));
  await s.orchestrator.sweep();
  assert.equal(runs, 1);
  assert.deepEqual(s.orchestrator.log.map((l) => l.outcome), ["ok", "duplicate"]);
});

test("the orchestrator's callId check refuses anything that could leave replies/", () => {
  assert.equal(answerable("6f1c2a9e-0000-4000-8000-000000000000"), true);
  for (const bad of ["../config/principals", "", "6f1c2a9e-0000-4000-8000-00000000000", "6f1c2a9e/0000-4000-8000-000000000000", "6f1c2a9e.0000-4000-8000-000000000000", "6f1c2a9e:0000-4000-8000-000000000000", "6f1c2a9e\\0000-4000-8000-000000000000"]) {
    assert.equal(answerable(bad), false, bad);
  }
});
