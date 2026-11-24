# Size budgets

The build fails if the app's files are too big. This page explains the two limits and what to do when you reach one.

## The two budgets

| File | Budget | Why |
|---|---|---|
| The page people open, `<id>.html` | Under 50,000 bytes | It is the one file that cannot update itself. A small file has less to get wrong. |
| The app file, `<id>-<version>.js` | Under 2,500,000 bytes | Every version is copied through the shared folder to every computer, and is kept there. |

Sizes are of the files as written, before any compression. A file at exactly its limit fails.

`npm run build` checks both as its last step, so `npm run ci` and every release check them too:

```text
Size budgets (uncompressed, must be under the limit):
  bootstrap 9,539 bytes of 50,000, 40,461 bytes headroom
  bundle    1,178,591 bytes of 1,400,000, 221,409 bytes headroom
```

The second line is the whole of version 0.1: the framework, React, the sync library, the diary calendar, the iCalendar parser and every screen. New screens share what is left.

The app budget was 500,000 bytes until the diary calendar was added. FullCalendar 7 and the Temporal polyfill it needs cost about 287,000 bytes, and the iCalendar parser about 76,000. With every screen of version 0.1 the app is 1,178,591 bytes (about 344,000 compressed), so the budget is 1,400,000. The calendar loads FullCalendar's time-grid views and, since drag to propose (OUT-85), its interaction plugin, but not its list or multi-month plugins.

On 2026-11-24 the OO2 v0.3 work brought the app to 1,390,824 bytes. Size is not a limit for this project, so the budget became 2,500,000: high enough never to cut a feature, low enough to catch a dependency pulled in by mistake.

## Why the app is one file

A page opened from disk cannot load a second script file by address. The page reads the app from the folder itself, verifies it, and runs it. One file means one hash to check and one thing to copy.

It also means there is no code splitting and no lazy loading. Everything the app can do is in the file from the start.

## When you reach the limit

The message names the file and the excess. This run had its limit lowered to show it:

```text
  bundle    773,823 bytes of 761,523, OVER BUDGET by 12,300 bytes
Size budget check failed.
```

Things to try, in order:

1. **Look at what you added last.** A date library, an icon set, a chart library or a calendar can cost more than every screen you have written.
2. **Import the part, not the package.** Many packages are only small if you import a single function from them.
3. **Use what the framework already ships.** `Button` and `Badge` are exported, and the stylesheet is already in the app file.

The budgets are in `framework/build/size-budget.js`. They are part of the framework, and raising them is a decision about every computer the app is copied to, not a build setting.

## Related

- [npm scripts](../reference/scripts.md)
- [Signed updates](signed-updates.md)
