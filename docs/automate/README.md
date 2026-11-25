# Outer Office and Power Automate

Power Automate does one thing for Outer Office: it reads a principal's Outlook calendar and saves Outlook's answer, untouched, as a file in the shared folder. The app does everything else.

To build the flow, follow **[set-up-diary-sync.md](../../app/src/automate/guides/set-up-diary-sync.md)**, which the app also shows on its **Automate** page. It has three steps and takes about ten minutes per principal.

## What the flow does

| | |
|---|---|
| Trigger | Recurrence, every 30 minutes |
| Step 1 | Office 365 Outlook **Send an HTTP request**: one `GET` to Microsoft Graph's `calendarView` for the principal's calendar |
| Step 2 | **Create file**: the request's **Body**, unchanged, into `automate/inbox/diary-sync/<principal code>/` |
| File name | The run's time in UTC, as `yyyyMMddTHHmmssZ.json`, for example `20261124T090000Z.json` |

The flow uses no Parse JSON, Select, Filter, Condition or loop.

## What the app does with the file

Everything that used to be a flow step is now in the app (`app/src/automate/graph-calendar.ts`, then `app/src/import/parse-automate.ts`):

- **The window.** The app takes the run's time from the file name. It reads the window as 7 days before that UTC day to 60 days after it, which is what the flow's URL asks for. Events inside the window that are no longer in the file are marked gone.
- **The fields.** It reads Graph's own shapes: `start.dateTime`, `location.displayName` and `organizer.emailAddress`.
- **Recurring meetings.** Graph gives each occurrence its own `iCalUId`. The app works out the series UID by zeroing the occurrence date inside that ID. That gives the UID Outlook writes in an `.ics` export, so a meeting keeps its notes whether it came from the sync or from an `.ics` file.
- **Private items.** It masks or drops `private` and `confidential` items, whichever the office chose. Their real subject never reaches the diary.
- **Cancelled meetings.** It leaves them out.
- **Clean-up.** It applies the newest file for each principal, then deletes that file and every older one.

The app refuses the whole file, and says why in **Needs action** and on the **Import** screen, when:

- the name isn't a time;
- the file holds an Outlook error instead of events, such as access denied;
- Outlook sent the diary in pages (`@odata.nextLink` is present) and the first page is not in date order, so the app can't tell what is missing. In date order, which `$orderby=start/dateTime` in the URL asks for, the app uses the days the first page covers and the Automate page says so;
- an event is missing a field the app needs, which usually means the `$select` in the URL was changed;
- applying it would mark most of the diary gone.

A file that is still arriving is not an error. The app tries it again on the next sync.

[example-calendarview.json](example-calendarview.json) shows what a file looks like. It is made up, and the app's tests read it.

## Privacy

Files in `automate/` are not encrypted. Anyone with access to the shared folder can read them, even without the workspace key. Each file is Outlook's own answer, so a private meeting's real subject sits in it until the app applies the file and deletes it. That happens the next time someone who can import has the app open. The URL never asks for meeting bodies. The Power Automate setting is off until an admin turns it on.

## Still to confirm on a real tenant

- That the series UID worked out from an occurrence's `iCalUId` matches the UID in an `.ics` export. If it doesn't, a recurring meeting's notes don't carry over between `.ics` and the sync. Nothing else changes.
- How long a file the flow writes takes to reach the laptop.
