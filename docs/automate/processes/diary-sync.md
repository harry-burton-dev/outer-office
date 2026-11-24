# Business process: `diary-sync` (processVersion 1)

**What it does.** On a schedule, it reads each principal's calendar and drops one event per principal into the inbox. The app reads the inbox on each sync tick, turns the payload into the same `ParseResult` that an `.ics` import gives, and applies it straight away through the same diff, with an import and a log entry when it changes anything. A file it can't use shows in Needs action and on the Import screen with the reason.

| | |
|---|---|
| Flows | `Diary sync` (scheduled), which calls the child flow `Diary · read window` |
| Writes | `automate/inbox/diary-sync/<principal>/<yyyyMMddTHHmmssZ>.json` |
| Event schema | [event](../schemas/event.schema.json), with `process: "diary-sync"` and `processVersion: 1` |
| Data schema | [diary-payload](../schemas/diary-payload.schema.json) |
| Example | [event-diary-sync.json](../examples/event-diary-sync.json) |
| Reads | `automate/config/principals.json` ([schema](../schemas/principals.schema.json), [example](../examples/principals.json)) |
| Schedule | Every 30 minutes, Monday to Friday, 07:00 to 19:00 UK time |
| Window | From 7 days before today to 60 days after |

## The diary payload

- `principal`, `windowStart`, `windowEnd`: the window that was read. The app's diff leaves stored events outside it alone.
- `count`: the number of events. The app refuses a payload whose `events` array has a different length.
- `masters`: required, and may be `[]`. One `{ id, iCalUId }` for each recurring series in the window. The master's `iCalUId` is the UID the same series has in an `.ics` export.
- `events`: one per occurrence, as Graph's `calendarView` returns it with `Prefer: outlook.timezone="UTC"`. The fields that matter for matching:
  - `type`: `singleInstance`, `occurrence` or `exception`.
  - `seriesMasterId` and `originalStart`, for occurrences and exceptions.
  - `iCalUId`. **Graph gives every occurrence its own `iCalUId`.** So the app keys an occurrence by its master's `iCalUId` plus `originalStart`, the same `(uid, recurrenceId)` key the `.ics` parser uses. That way a moved meeting keeps its prep notes, whichever source it came from.
  - `start` and `end`: Graph's `dateTime` strings in UTC, without a `Z`. `timeZone` says `UTC`.
  - `isAllDay`, `isCancelled`, `showAs`, `sensitivity` and `lastModifiedDateTime`.
  - `subject`, `location`, `organizer`, `categories` and `attendees`. These are already masked for private and confidential items.

**Every event has exactly these keys**, with `null` where Graph has nothing. A missing key or an extra one (such as `body`) fails the schema, so a connector that quietly drops `type` or `originalStart` is caught. The schema also checks four more things:
- `originalStart` is set whenever `seriesMasterId` is.
- `timeZone` is always `UTC`.
- `showAs` is one of `free`, `tentative`, `busy`, `oof`, `workingElsewhere` or `unknown`.
- Private and confidential items are masked: `subject` is `"Private"`, `location` and `organizer` are `null`, and `categories` and `attendees` are empty.

The app's adapter (`app/src/import/parse-automate.ts`, OUT-55) checks what a schema can't: that `count` matches, that every series is listed in `masters`, and that every time can be read. It refuses the whole file if any check fails.

[diary-payload-outlook-fixture.json](../examples/diary-payload-outlook-fixture.json) is the same made-up diary as the app's `.ics` test file, so the two sources can be compared side by side.

**Why Graph and not "Get calendar view of events (V3)".** The V3 connector action doesn't return `type` or `originalStart`, and without them a moved occurrence of a series can't be matched. The flow uses the Office 365 Outlook action **Send an HTTP request** against Graph instead. If a tenant's data policy blocks that action, this process can't keep notes on moved recurring meetings. The spike records whether it's allowed.

## Still to confirm on a real tenant

These come from the OO1 spike, and processVersion 1 is frozen once they're confirmed:

- The exact field names and shapes in a real capture, especially `attendees` and `organizer`.
- That the master's `iCalUId` equals the `.ics` UID. The cross-source key test in OUT-55 checks this.
- Whether files the flow writes show up readable on the laptop, and how long they take.
