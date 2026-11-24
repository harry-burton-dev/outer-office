// Writes the orchestrator conformance notices (C1 to C10), with fresh times,
// into automate/calls/ in the synced folder, and prints what each should get.
//   node docs/automate/conformance/make-notices.mjs <path to automate/calls> <principal> [<unknown principal>]
// The notices expire after 15 minutes, so run it again for a fresh set.
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCases } from "../../../framework/automate/testing/conformance.js";

const [dir, principal, unknownPrincipal] = process.argv.slice(2);
if (!dir || !principal) {
  console.error("usage: node docs/automate/conformance/make-notices.mjs <automate/calls> <principal> [<unknown principal>]");
  process.exit(1);
}

const cases = buildCases({ now: Date.now(), principal, unknownPrincipal, newId: randomUUID });
const rows = [];
for (const c of cases) {
  for (const f of c.files) writeFileSync(join(dir, f.name), f.text);
  const reply = c.reply ? `${c.reply.status}${c.reply.code ? `, ${c.reply.code}` : ""}${c.reply.echoesApi ? "" : ", no api or apiVersion"}` : "no reply";
  const stays = { answered: "gone once answered", "15 minutes": "gone 15 minutes after writing", ever: "never touched" }[c.staysFor];
  rows.push({ case: c.id, files: c.files.map((f) => f.name).join(" + "), callId: c.callId ?? "-", reply, notice: stays });
}
console.table(rows);
