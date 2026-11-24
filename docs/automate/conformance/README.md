# Orchestrator conformance checklist

These cases check the **Automate · orchestrator** flow. The fake orchestrator in `framework/automate/testing/` passes all ten in `npm test`, and the app's automate client is tested against that fake. So a real flow that passes them behaves the way the client expects.

The cases are defined once, in `framework/automate/testing/conformance.js`. The tests and the script below both use that list.

## How to run it against the real flow

1. From the repository, after `npm ci`, run:
   ```sh
   node docs/automate/conformance/make-notices.mjs "<synced folder>/automate/calls" PRINCIPAL-A
   ```
   Use a principal that is in `automate/config/principals.json`. The script writes the files with fresh times and prints each case's `callId` and what it should get. The notices expire after 15 minutes, so run it again for a fresh set.
2. After 5 minutes, check every row. Check C6 and C10 again after 20 minutes.

| # | File | Reply in `automate/replies/` | The notice |
|---|---|---|---|
| C1 | `c1.json`, a valid `diary.fetch` | `ok`, with a diary payload in `result` | gone |
| C2 | `c2.json` and `c2 (1).json`, one notice twice | **one** reply, `ok` | both gone |
| C3 | `c3.json`, `api` `nope` | `rejected`, `unknown-api` | gone |
| C4 | `c4.json`, `version` 2 | `rejected`, `invalid-or-expired`, with no `api` or `apiVersion` | gone |
| C5 | `c5.json`, expired an hour ago | `rejected`, `invalid-or-expired`, with no `api` or `apiVersion` | gone |
| C6 | `c6.json`, not JSON | none | there at 5 minutes, gone by 20 |
| C7 | `c7.json`, an unknown principal | `error`, `child-failed`, message `No mailbox for this principal` | gone |
| C8 | `c8.json.crswap`, a browser temp file | none | never touched. Delete it yourself. |
| C9 | `c9.json`, a window that ends before it starts | `rejected`, `invalid-or-expired` | gone |
| C10 | `c10.json`, `callId` `../config/principals` | none, and nothing written outside `replies/` | there at 5 minutes, gone by 20 |

Check each reply against the schema with `node docs/automate/schemas/check.mjs <reply>.json`.

## Timing the client relies on

The client marks a call **timed out 5 minutes after its `expiresAt`**, not at `expiresAt` itself. The orchestrator still accepts a call for 2 minutes past `expiresAt`, and the reply then needs one more sweep (2 minutes) and a sync to arrive. Timing out at `expiresAt` would throw away replies the flow was right to send. A reply that arrives after the timeout is deleted and ignored, and the call stays timed out.

When the client times a call out, it also deletes the notice if it is still in `calls/`, so a flow that was off doesn't answer it hours later.
