# The automate protocol (version 1)

This page holds the rules every flow and the app follow when they talk through `automate/`. The schemas in [schemas/](schemas/) are the contract, and this page explains them. It was agreed in OUT-52 on 2026-11-23, and the reasoning is in the OO1 epic's `spec-v3.md`.

## Layout

```text
automate/
  config/principals.json                          principal id → mailbox. Written by hand, read by flows only.
  calls/<callId>.json                             notice. Written by the app, deleted by the orchestrator after it replies.
  replies/<callId>.json                           reply. Written by the orchestrator, deleted by the app after it applies it.
  inbox/<process>/<principal>/<yyyyMMddTHHmmssZ>.json   event. Written by a business process. The app deletes it after
                                                  applying it, and the process deletes anything older than 48 hours.
```

Set the `automate` folder to **Always keep on this device**, the same as the rest of the shared folder.

## The envelope

Every file has `protocol: "outer-office/automate"`, `version: 1` and a `kind`.

| `kind` | Written by | Schema | Identity |
|---|---|---|---|
| `call` | the app | [notice](schemas/notice.schema.json) | `callId` (a UUID) |
| `reply` | the orchestrator | [reply](schemas/reply.schema.json) | the same `callId` |
| `event` | a business process | [event](schemas/event.schema.json) | `process` + principal + `generatedAt` |

**Everything is inline.** A notice carries its `input`, a reply its `result`, and an event its `data`. Version 1 has no separate payload or result files. The OneDrive client uploads files in whatever order it likes, so a pair of files can't be trusted to arrive together.

**Identity is inside the file, never its name.** A conflict copy such as `x (1).json` is a duplicate of `x.json` and is treated as one.

**Times are UTC**, written as `yyyy-MM-ddTHH:mm:ssZ`. File names use the compact form `yyyyMMddTHHmmssZ`, because names can't contain colons.

## Rules

1. **Handle every call once.** The orchestrator runs on a recurrence with concurrency 1, lists `calls/`, and skips any `callId` that already has a reply. It writes the reply before it deletes the notice, so a notice is never lost without an answer.
2. **Don't trust the file trigger.** "When a file is created" can miss files the browser saves, because the browser writes a `.crswap` temp file and renames it, and OneDrive doesn't count a moved file as new. It also struggles past about 30 changes between checks. The orchestrator sweeps the folder instead. A file trigger may be added later only as a doorbell that starts the same sweep.
3. **Ignore anything that isn't `*.json`.** That covers `.crswap` and other temp files.
4. **A half-written file means "not yet".** If a file won't parse, the reader leaves it and tries again on the next pass. The orchestrator deletes a notice that still won't parse after 15 minutes.
5. **Expiry.** The orchestrator rejects a call past its `expiresAt`, allowing 2 minutes of clock tolerance. The app sets `expiresAt` 15 minutes after `issuedAt`. It marks a call as timed out only if there is still no reply **5 minutes after `expiresAt`**, which covers the 2 minutes of tolerance plus one sweep and one sync.
6. **Status.**
   - `ok`: `result` set, `error` null.
   - `error`: the child flow failed. `result` null, and `error` is `{ code, message }`.
   - `rejected`: the orchestrator refused the call (unknown API, unknown version, expired or malformed). `result` null, and `error` set.
7. **Applying is idempotent.** Applying the same reply or event twice changes nothing the second time. The call records in synced data show status to every user, but they are not a lock.
8. **Inbox files are never overwritten.** Each run writes a new timestamped file. The app applies only the newest per principal, then deletes it and every older one.
9. **Versions, at two levels.** `version` covers the envelope. `apiVersion` and `processVersion` cover each API's or process's own data. A flow rejects versions it doesn't know rather than guessing.
10. **Nothing private leaves Outlook.** A flow masks `private` and `confidential` items before writing anything: the subject becomes "Private", and location, organizer, categories and attendees go. Meeting bodies are never written, and the schema forbids `body` and `bodyPreview`.

## Who can call

Anyone who can write to the shared folder can drop a notice, and `caller` is only what the app claims. So:

- **Read-only APIs and business processes** accept folder access as enough. Today that is every API.
- **Before the first API that changes something** (for example, one that sends email), the orchestrator must check the notice's author against an allow-list, or the API must only create a draft that a person sends. OneDrive's *properties only* trigger and *List files in folder* give `LastModifiedBy`, and each reply records it as `handledFor`.
- Anyone with folder access but no workspace key can read the plain files in `automate/` while they exist. Keep them short-lived, and keep them to what an exported `.ics` file would already show.

## Adding an API

1. Write `apis/<name>.md` and schemas for its input and result, with examples, as described in [README.md](README.md).
2. Build a child flow in the **Outer Office automate** solution. It takes the input fields and returns `payload` (text) through **Respond to a PowerApp or flow**.
3. Add a case `<name>@<apiVersion>` to the orchestrator's **Switch**.

Neither the envelope nor the orchestrator's other steps change.

## Adding a business process

1. Write `processes/<name>.md`, plus a schema for its `data` and an example event.
2. Build a scheduled flow that writes events to `inbox/<name>/<principal>/`, and deletes anything there older than 48 hours.
