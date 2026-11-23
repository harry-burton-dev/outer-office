# Outer Office and Power Automate

Outer Office has no server. Power Automate is its backend, and the shared OneDrive folder carries plain JSON files both ways, under `automate/` beside the encrypted data.

There are two kinds of traffic:

- **API calls**: the app asks for something. It writes a *notice* into `automate/calls/`, one orchestrator flow routes it to a child flow, and a *reply* comes back in `automate/replies/`.
- **Business processes**: a flow runs on its own schedule and drops an *event* into `automate/inbox/<process>/`. Nothing in the app asks for it.

The rules both follow are in [protocol.md](protocol.md).

## Catalogue

| Name | Kind | Page | Data schema |
|---|---|---|---|
| `diary-sync` | business process | [processes/diary-sync.md](processes/diary-sync.md) | [diary-payload](schemas/diary-payload.schema.json) |
| `diary.fetch` | API | [apis/diary.fetch.md](apis/diary.fetch.md) | in: [diary.fetch.input](schemas/diary.fetch.input.schema.json), out: [diary-payload](schemas/diary-payload.schema.json) |

## Designing a flow

You need three things from this folder:

1. **The examples** in `examples/`, which show what a correct file looks like.
   - `notice-diary-fetch.json` is what the app writes.
   - `reply-*.json` and `event-diary-sync.json` are what a flow must write.
   - `principals.json` is the shape of `automate/config/principals.json`.

   In a **Parse JSON** action you can also choose *Use sample payload to generate schema* and paste an example.
2. **The Parse JSON schemas** in `schemas/power-automate/`. Paste one into a Parse JSON action's **Schema** box to get dynamic content for every field. They carry types and required fields only, so a malformed notice reaches your own checks, gets a `rejected` reply, and doesn't fail the run.
3. **The full schemas** in `schemas/`. These are the contract, in JSON Schema 2020-12. A flow's output is correct when it validates against them, and the app's tests check the examples against them.

### Checking a flow's output

Copy the file the flow wrote out of the synced folder, then run this from the repository, after `npm ci`:

```sh
node docs/automate/schemas/check.mjs <the file>.json
```

It picks the schema from the file's `kind`, and also checks a reply's `result`, an event's `data` and a `diary.fetch` notice's `input`. It prints each error with the path of the field at fault.

## Changing a schema

1. Edit the file in `schemas/`, and add or adjust an example in `examples/`. Every invalid example in `examples/invalid/` carries a `_why`.
2. Run `node docs/automate/schemas/power-automate/generate.mjs` to rebuild the Parse JSON copies.
3. Run `npm run test:app`. `app/src/automate/schemas.test.ts` fails if the examples and schemas disagree, or if the Parse JSON copies are stale.
4. A breaking change to an API's input or result raises that API's `apiVersion`. A breaking change to a process's data raises its `processVersion`. A change to the envelope raises `version`. The orchestrator rejects versions it doesn't know.
