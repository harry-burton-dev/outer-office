# Set up the diary sync in Power Automate

You build one small flow for each principal. It has three parts: a timer, one request to Outlook, and one file save. You don't map, filter or reshape anything, because the app does all of that.

Allow about ten minutes for the first principal and three for each one after that, made by copying the first flow.

## Before you start

You need:

- The principal's **code** from the admin page's **Principals** table, for example `PRINCIPAL-A`.
- The principal's **email address**, for example `jane.smith@yourorg.gov.uk`.
- Access to the principal's calendar from your own Outlook. You can open their calendar in Outlook and see the meeting details.
- The shared folder open in File Explorer on your computer.

## 1. Make the folder

1. In File Explorer, open the shared folder.
2. Make these folders inside it, one inside the next: `automate` → `inbox` → `diary-sync` → `PRINCIPAL-A`. Use the principal's code for the last one, spelled exactly as the admin page shows it.
3. Right-click the `automate` folder and choose **Always keep on this device**.

## 2. Turn the setting on

1. Open the admin page.
2. Under **Office**, set **Power Automate** to **On: read diary updates from the automate folder**.
3. Click **Save**.

## 3. Create the flow

1. Go to [make.powerautomate.com](https://make.powerautomate.com).
2. In the left menu, click **Create**, then **Scheduled cloud flow**.
3. Set **Flow name** to `Diary sync · PRINCIPAL-A`.
4. Set **Repeat every** to `30` and choose **Minute**.
5. Click **Create**.

## 4. Add the request to Outlook

1. Under the **Recurrence** box, click **+**, then **Add an action**.
2. Search for `Send an HTTP request`. Pick the one under **Office 365 Outlook**. Don't pick the HTTP connector or the Office 365 Users one.
3. If it asks you to sign in, sign in as yourself.
4. Set **Method** to `GET`.
5. Build the **URI** box from five pieces, in this order. Paste pieces A, C and E as text. Add pieces B and D with the **fx** (insert expression) button: paste the expression, then click **Add**.

   **A.** Paste this, with the principal's email address in place of `jane.smith@yourorg.gov.uk`:

   ```text
   https://graph.microsoft.com/v1.0/users/jane.smith@yourorg.gov.uk/calendar/calendarView?startDateTime=
   ```

   **B.** Expression:

   ```text
   startOfDay(addDays(utcNow(),-7))
   ```

   **C.** Paste:

   ```text
   &endDateTime=
   ```

   **D.** Expression:

   ```text
   startOfDay(addDays(utcNow(),60))
   ```

   **E.** Paste:

   ```text
   &$top=999&$select=iCalUId,type,seriesMasterId,originalStart,start,end,isAllDay,isCancelled,subject,location,organizer,categories,showAs,sensitivity,lastModifiedDateTime,attendees
   ```

   When you've finished, the box reads: piece A, a purple `startOfDay(...)` token, `&endDateTime=`, a second purple token, then piece E. There are no spaces anywhere.
6. Leave **Body** empty. Leave **Content-Type** as it is.
7. Optional: if the action shows a header box under **Advanced parameters**, add the header `Prefer` with the value `outlook.timezone="UTC"`. Outlook sends UTC without it, so you can skip this step.

Don't change the `-7` or the `60`. The app works out the window from the file's name and expects those two numbers.

## 5. Add the file save

1. Under **Send an HTTP request**, click **+**, then **Add an action**.
2. Choose the **Create file** action that matches where the shared folder lives:
   - If the folder is in OneDrive, use **OneDrive for Business**: **Create file**.
   - If it's in a SharePoint site or a Teams channel, use **SharePoint**: **Create file**. Then pick the **Site Address** first.
3. **Folder Path**: click the folder icon and browse to `automate` → `inbox` → `diary-sync` → `PRINCIPAL-A`.
4. **File Name**: click **fx**, paste this expression, then click **Add**:

   ```text
   concat(utcNow('yyyyMMddTHHmmss'), 'Z.json')
   ```

5. **File Content**: click the lightning-bolt icon (dynamic content). Under **Send an HTTP request**, choose **Body**.
6. Click **Save**, at the top right.

That's the whole flow: **Recurrence** → **Send an HTTP request** → **Create file**.

## 6. Test it

1. Click **Test**, choose **Manually**, then click **Test** and **Run flow**.
2. Wait for green ticks on all three steps.
3. In File Explorer, open `automate/inbox/diary-sync/PRINCIPAL-A`. A file such as `20261124T091512Z.json` appears within a minute or two.
4. Open Outer Office, signed in as someone who can import, and choose the principal. Within one sync, the diary fills in and the log shows **Power Automate sync: … added**. The file then disappears from the folder.

If something is wrong, the app says so in **Needs action** → **Diary update can't be used**. The **Import** screen shows the reason.

## More principals

1. On the flow's page, click **Save As** and name the copy `Diary sync · PRINCIPAL-B`.
2. In the copy, change the email address in the **URI** and the **Folder Path**. Make the `PRINCIPAL-B` folder first, as in step 1.
3. Turn the copy on: **Turn on**, at the top.

## When it goes wrong

| What you see | What it means | What to do |
|---|---|---|
| **Send an HTTP request** fails with `403` or `ErrorAccessDenied` | Your account can't read that calendar through Outlook's connector | Ask the principal to share their calendar with you with **Can view all details**, or higher. Wait an hour and run the test again. If it still fails, the flow has to run under an account that owns the calendar: use `/me/calendar/calendarView` in piece A in place of `/users/…/calendar/calendarView`. |
| **Send an HTTP request** fails with `400` and mentions the URI | A piece of the URI is wrong, or has a space in it | Compare the box with step 4.5. The two expressions must be purple tokens, not typed text. |
| The action refuses the URI as not supported | The URI doesn't start with `/users/…/calendar/` or `/me/calendar/` | Use the URI in step 4.5 exactly. The connector only accepts addresses that start this way. |
| **Create file** fails: folder not found | The folder isn't there, or the path was typed by hand | Make the folder (step 1), then pick it again with the folder icon. |
| The app says *Outlook sent only the first page* | The URI lost `$top=999` | Put piece E back exactly as given. |
| The app says *an event has no …. Check the $select* | The `$select` list in piece E was changed | Put piece E back exactly as given. |
| The app says *it would mark N of M events gone, so it was held back* | The file is missing most of the diary, often because it was the wrong calendar | Check the email address in the URI. If the meetings really were deleted, import an `.ics` file and confirm. |
| No file appears, but the flow ran | OneDrive hasn't synced it to your computer yet | Wait a few minutes. Check that `automate` is set to **Always keep on this device**. |
