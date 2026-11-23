# API: `diary.fetch` (apiVersion 1)

**What it does.** It reads one principal's diary now, rather than waiting for the next `diary-sync` run. The app calls it from a "Refresh now" button, and the result goes through the same review as a scheduled sync.

| | |
|---|---|
| Child flow | `Diary · read window`, the same one `diary-sync` uses |
| Input schema | [diary.fetch.input](../schemas/diary.fetch.input.schema.json): `principal`, `windowStart` and `windowEnd` |
| Result schema | [diary-payload](../schemas/diary-payload.schema.json), the same shape as the `diary-sync` event's `data` |
| Examples | [notice](../examples/notice-diary-fetch.json), [ok reply](../examples/reply-diary-fetch-ok.json), [error reply](../examples/reply-error.json) |
| Side effects | None. Folder access is enough to call it (see [protocol.md](../protocol.md#who-can-call)). |

## Errors

| `status` | `error.code` | When |
|---|---|---|
| `error` | `child-failed` | The child flow failed. The message says why, for example `No mailbox for this principal in principals.json`, or `More than 999 events; shorten the window`. |
| `rejected` | `invalid-or-expired` | The envelope is wrong, the version is unknown, or the call is past `expiresAt`. |
| `rejected` | `unknown-api` | Returned for any API name the orchestrator doesn't route. |
