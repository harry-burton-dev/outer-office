# Size budgets

The build fails if the app's files are too big. This page explains the two limits and what to do when you reach one.

## The two budgets

| File | Budget | Why |
|---|---|---|
| The page people open, `<id>.html` | Under 50,000 bytes | It is the one file that cannot update itself. A small file has less to get wrong. |
| The app file, `<id>-<version>.js` | Under 1,100,000 bytes | Every version is copied through the shared folder to every computer, and is kept there. |

Sizes are of the files as written, before any compression. A file at exactly its limit fails.

`npm run build` checks both as its last step, so `npm run ci` and every release check them too:

```text
Size budgets (uncompressed, must be under the limit):
  bootstrap 9,539 bytes of 50,000, 40,461 bytes headroom
  bundle    773,823 bytes of 1,100,000, 326,177 bytes headroom
```

The second line is the framework, React, the sync library and the diary calendar. Your screens and whatever they import share what is left.

The app budget was 500,000 bytes until the diary calendar was added. FullCalendar 7 and the Temporal polyfill it needs cost about 287,000 bytes, so the budget went up to 1,100,000, which leaves about 300,000 bytes for the rest of the app. The calendar loads only FullCalendar's time-grid views, not its interaction, list or multi-month plugins.

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
