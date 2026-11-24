// @vitest-environment node
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { clearUpdate, DIARY_INBOX, scanDiaryInbox, type InboxCache } from "./diary-inbox";
import { memoryPlainFiles } from "./testing/memory-plain-files";
import { graphFile } from "./testing/graph-file";
import { MAIN_PAYLOAD } from "@/import/fixtures/diary-payload";

const A = `${DIARY_INBOX}/PRINCIPAL-A`;

describe("scanDiaryInbox", () => {
  test("gives the newest file per principal, with the older ones to delete after", async () => {
    const files = memoryPlainFiles("automate", {
      [`${A}/20261019T083000Z.json`]: graphFile(),
      [`${A}/20261019T090000Z.json`]: graphFile(),
      [`${A}/notes.txt`]: "not a diary",
      [`${DIARY_INBOX}/PRINCIPAL-B/20261019T090000Z.json`]: graphFile({ ...MAIN_PAYLOAD, principal: "PRINCIPAL-B" }),
    });
    const entries = await scanDiaryInbox(files, new Map());
    expect(entries.map((e) => e.ok && [e.update.principal, e.update.path, e.update.olderPaths, e.update.generatedAt])).toEqual([
      ["PRINCIPAL-A", `${A}/20261019T090000Z.json`, [`${A}/20261019T083000Z.json`], "2026-10-19T09:00:00Z"],
      ["PRINCIPAL-B", `${DIARY_INBOX}/PRINCIPAL-B/20261019T090000Z.json`, [], "2026-10-19T09:00:00Z"],
    ]);
  });

  test("an empty inbox, or no inbox folder, gives nothing", async () => {
    expect(await scanDiaryInbox(memoryPlainFiles(), new Map())).toEqual([]);
  });

  test("a half-arrived newest file gives nothing yet, and is read again on the next scan", async () => {
    const whole = graphFile();
    const files = memoryPlainFiles("automate", { [`${A}/20261019T090000Z.json`]: whole.slice(0, 100) });
    const cache: InboxCache = new Map();
    expect(await scanDiaryInbox(files, cache)).toEqual([]);
    await files.write(`${A}/20261019T090000Z.json`, whole);
    expect((await scanDiaryInbox(files, cache))[0]?.ok).toBe(true);
  });

  test("an unusable newest file is reported with the reason, not skipped for an older one", async () => {
    const files = memoryPlainFiles("automate", {
      [`${A}/20261019T083000Z.json`]: graphFile(),
      [`${A}/20261019T090000Z.json`]: JSON.stringify({ error: { code: "ErrorAccessDenied", message: "Access is denied." } }),
    });
    expect(await scanDiaryInbox(files, new Map())).toEqual([
      { ok: false, principal: "PRINCIPAL-A", path: `${A}/20261019T090000Z.json`, reason: "it holds an error from Outlook: Access is denied" },
    ]);
  });

  test("reads a file once while it is unchanged", async () => {
    const files = memoryPlainFiles("automate", { [`${A}/20261019T090000Z.json`]: graphFile() });
    const cache: InboxCache = new Map();
    await scanDiaryInbox(files, cache);
    await scanDiaryInbox(files, cache);
    expect(files.reads).toBe(1);
  });

  test("clearUpdate deletes the update and the files it replaced, and leaves newer ones", async () => {
    const files = memoryPlainFiles("automate", {
      [`${A}/20261019T083000Z.json`]: graphFile(),
      [`${A}/20261019T090000Z.json`]: graphFile(),
    });
    const [entry] = await scanDiaryInbox(files, new Map());
    await files.write(`${A}/20261019T093000Z.json`, graphFile());
    if (!entry?.ok) throw new Error("expected an update");
    await clearUpdate(files, entry.update);
    expect([...files.files.keys()]).toEqual([`${A}/20261019T093000Z.json`]);
  });
});

test("the example in docs/automate is read like the flow's own file", async () => {
  const example = readFileSync(new URL("../../../docs/automate/example-calendarview.json", import.meta.url), "utf8");
  const files = memoryPlainFiles("automate", { [`${A}/20261124T090000Z.json`]: example });
  const [entry] = await scanDiaryInbox(files, new Map());
  expect(entry?.ok && entry.update.payload.events.length).toBe(4);
});
