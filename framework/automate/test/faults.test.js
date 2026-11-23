// The client against the fake orchestrator with the simulator's faults on:
// upload and download lag, half-arrived files, .crswap leftovers, junk files,
// conflict copies, and read and write failures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFILES } from "../../engine/src/harness/faults.js";
import { MINUTE, cloudFolder, run, setup } from "./helpers.js";

const FAULTS = { ...PROFILES.rough.sim, conflictCopy: { probability: 0.3 } };
const input = { principal: "PRINCIPAL-A", windowStart: "2026-11-16T00:00:00Z", windowEnd: "2027-02-23T00:00:00Z" };

for (let n = 1; n <= 30; n++) {
  const seed = `s${n}`;
  test(`rough faults, seed ${seed}: every call settles once as done, and no message file is left`, async () => {
    const s = await setup({ seed, faults: FAULTS });
    const issued = [];
    const settled = [];
    const runFor = async (ms) => settled.push(...(await run(s.world, ms, s)).settled.map((r) => r.callId));
    for (let i = 0; i < 6; i++) {
      for (;;) {
        try {
          issued.push((await s.client.call("diary.fetch", input)).callId);
          break;
        } catch {
          // a write failure: the app would show it and the person tries again
        }
      }
      await runFor(MINUTE);
    }
    await runFor(15 * MINUTE);
    assert.deepEqual(issued.map((id) => s.client.records.get(id).status), issued.map(() => "done"));
    assert.deepEqual([...settled].sort(), [...issued].sort(), "each call settles exactly once");
    await s.world.quiesce();
    await run(s.world, 4 * MINUTE, s); // a clean sweep and tick once the faults stop
    await s.world.quiesce();
    const left = [...Object.keys(cloudFolder(s.world, "calls")), ...Object.keys(cloudFolder(s.world, "replies"))].filter((n) => n.endsWith(".json"));
    assert.deepEqual(left, []);
  });
}
