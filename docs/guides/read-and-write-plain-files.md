# Read and write plain files

Everything the app syncs is encrypted. Sometimes another tool needs to read what the app writes, or write something for the app to read. Power Automate is one example. For that, the app can keep **plain files**: ordinary, unencrypted files in one subfolder of the shared folder, such as `automate/`.

**You will learn**

- How to get the plain-file API for a subfolder
- How to read a file that may still be arriving
- How to check the folder on every sync tick
- What the other tool must do so the app can read its files

> **Pitfall**
>
> Plain files are not encrypted. Anyone who can open the shared folder can read them, including people with no workspace key. Keep them short-lived, and keep out anything the tool doesn't need.

## Get the API for a subfolder

`useSession().plainFiles(folder)` returns the API for one subfolder of the shared folder. Paths are relative to that subfolder, with `/` between the parts:

```tsx
import { useSession } from "@trellis/framework";

export function SendProbe() {
  const { plainFiles } = useSession();
  const send = async () => {
    const files = plainFiles("automate");
    await files.writeJson("calls/probe.json", { kind: "probe", at: new Date().toISOString() });
  };
  return <button onClick={() => void send()}>Send a probe</button>;
}
```

- `write` and `writeJson` create the folders on the path, and replace a file of the same name. `writeJson` writes indented JSON in UTF-8, with no byte-order mark.
- `list(dir)` returns the files directly inside `dir`, sorted by name, each with `name`, `path`, `size` and `lastModified`. A folder that doesn't exist lists as empty.
- `listDirs(dir)` returns the folders directly inside `dir`.
- `delete(path)` resolves `false` when the file was already gone.

The subfolder name is lower-case letters, digits and hyphens. It can't be `app`, `backups`, `data` or `status`, because the framework uses those. The sync engine reads only `data/` and `status/`, so it never reads, reports or removes your plain files.

## Read a file that may still be arriving

OneDrive and SharePoint copy a file down in pieces, so a read can see half of one. `read` and `readJson` don't throw for that. They return a result you check:

```ts
import type { PlainFiles } from "@trellis/framework";

export async function readReply(files: PlainFiles, callId: string): Promise<unknown | null> {
  const result = await files.readJson(`replies/${callId}.json`);
  if (result.ok) return result.value;
  // "missing": not there. "incomplete": not valid JSON yet. "unreadable": the folder refused.
  // In each case, try again on a later tick.
  return null;
}
```

`read` gives the text instead of parsed JSON. Both drop a leading byte-order mark, which some tools write.

> **Pitfall**
>
> A file can appear twice, as `x.json` and a conflict copy such as `x-LAPTOP.json` or `x (1).json`. Never take a file's identity from its name. Put an id inside the file and use that.

## Check the folder on every tick

`useSession().onTick(listener)` runs `listener` after each sync tick, about once a second. Ticks never overlap, so a slow listener holds the next tick back rather than running twice. If the listener throws, the error is logged and the next tick runs as usual. `onTick` returns a function that removes the listener, which suits `useEffect`:

```tsx
import { useEffect, useState } from "react";
import { useSession } from "@trellis/framework";

export function InboxCount() {
  const { plainFiles, onTick } = useSession();
  const [count, setCount] = useState(0);
  useEffect(() => {
    const files = plainFiles("automate");
    return onTick(async () => setCount((await files.list("inbox")).length));
  }, [plainFiles, onTick]);
  return <p>{count} files waiting</p>;
}
```

Listing a folder on the computer is cheap, but reading every file each second is not. Skip files you have already handled, and do heavy work only when the list changes.

## What the other tool must do

The app can read a file only if the tool that writes it follows these rules:

- **Write UTF-8 JSON.** A byte-order mark is fine.
- **Use names that Windows and OneDrive accept.** A name can't contain `\ / : * ? " < > |`, or start or end with a space, or end with a dot. Write times in file names as `yyyyMMddTHHmmssZ`, since `2026-11-23T21:00:00Z` has colons.
- **Write each file once, whole.** Don't append to a file the app may be reading. Write a new file instead.
- **Ignore files that aren't `*.json`.** The browser writes a `.crswap` file next to the real one while it saves, and OneDrive adds files such as `desktop.ini`. The app's `list` already leaves out `.crswap`, `.tmp`, `desktop.ini`, `~$…` and names that start with a dot.

App code can't use the folder handle directly. `npm test` fails if shipped app code calls `getDirectoryHandle`, `getFileHandle`, `createWritable`, `removeEntry` or `showDirectoryPicker`. Use the plain-file API instead.
