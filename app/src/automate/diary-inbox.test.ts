// @vitest-environment node
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { checkDiaryEvent, clearUpdate, DIARY_INBOX, PROTOCOL, scanDiaryInbox, type InboxCache } from "./diary-inbox";
import { memoryPlainFiles } from "./testing/memory-plain-files";
import { diaryEvent } from "./testing/diary-event";
import { MAIN_PAYLOAD } from "@/import/fixtures/diary-payload";

const example = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../docs/automate/examples/${name}`, import.meta.url), "utf8"));

const A = `${DIARY_INBOX}/PRINCIPAL-A`;

test("the protocol name is the one the envelope schema fixes", () => {
  const schema = JSON.parse(readFileSync(new URL("../../../docs/automate/schemas/envelope.schema.json", import.meta.url), "utf8")) as { properties: { protocol: { const: string } } };
  expect(PROTOCOL).toBe(schema.properties.protocol.const);
});

describe("checkDiaryEvent", () => {
  test("accepts the protocol's diary-sync example and the Outlook fixture", () => {
    expect(checkDiaryEvent(example("event-diary-sync.json"), "PRINCIPAL-A")).toMatchObject({ ok: true, generatedAt: "2026-11-23T21:00:00Z" });
    expect(checkDiaryEvent(JSON.parse(diaryEvent()), "PRINCIPAL-A").ok).toBe(true);
  });

  test.each([
    [{ kind: "reply" }, "not an Outer Office automate event"],
    [{ version: 2 }, "protocol version 2"],
    [{ process: "other" }, "not diary-sync"],
    [{ processVersion: 2 }, "diary-sync version 2"],
    [{ generatedAt: "soon" }, "generatedAt"],
    [{ data: { ...MAIN_PAYLOAD, principal: "PRINCIPAL-B" } }, "is in PRINCIPAL-A's folder"],
    [{ data: { ...MAIN_PAYLOAD, events: "none" } }, "no list of events"],
    [{ data: { ...MAIN_PAYLOAD, masters: [{ id: 1 }] } }, "masters"],
    [{ data: { ...MAIN_PAYLOAD, events: [{ ...MAIN_PAYLOAD.events[0], isAllDay: "no" }] } }, "isAllDay"],
    [{ data: { ...MAIN_PAYLOAD, events: [{ ...MAIN_PAYLOAD.events[0], sensitivity: "secret" }] } }, "sensitivity"],
    [{ data: { ...MAIN_PAYLOAD, events: [{ ...MAIN_PAYLOAD.events[0], subject: 3 }] } }, "subject"],
  ])("refuses %j, saying why", (change, reason) => {
    const result = checkDiaryEvent({ ...JSON.parse(diaryEvent()), ...change }, "PRINCIPAL-A");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain(reason);
  });
});

describe("scanDiaryInbox", () => {
  test("gives the newest file per principal, with the older ones to delete after", async () => {
    const files = memoryPlainFiles("automate", {
      [`${A}/20261123T203000Z.json`]: diaryEvent("2026-11-23T20:30:00Z"),
      [`${A}/20261123T210000Z.json`]: diaryEvent("2026-11-23T21:00:00Z"),
      [`${A}/notes.txt`]: "not a diary",
      [`${DIARY_INBOX}/PRINCIPAL-B/20261123T210000Z.json`]: diaryEvent("2026-11-23T21:00:00Z", { ...MAIN_PAYLOAD, principal: "PRINCIPAL-B" }),
    });
    const entries = await scanDiaryInbox(files, new Map());
    expect(entries.map((e) => e.ok && [e.update.principal, e.update.path, e.update.olderPaths, e.update.generatedAt])).toEqual([
      ["PRINCIPAL-A", `${A}/20261123T210000Z.json`, [`${A}/20261123T203000Z.json`], "2026-11-23T21:00:00Z"],
      ["PRINCIPAL-B", `${DIARY_INBOX}/PRINCIPAL-B/20261123T210000Z.json`, [], "2026-11-23T21:00:00Z"],
    ]);
  });

  test("an empty inbox, or no inbox folder, gives nothing", async () => {
    expect(await scanDiaryInbox(memoryPlainFiles(), new Map())).toEqual([]);
  });

  test("a half-arrived newest file gives nothing yet, and is read again on the next scan", async () => {
    const whole = diaryEvent();
    const files = memoryPlainFiles("automate", { [`${A}/20261123T210000Z.json`]: whole.slice(0, 100) });
    const cache: InboxCache = new Map();
    expect(await scanDiaryInbox(files, cache)).toEqual([]);
    await files.write(`${A}/20261123T210000Z.json`, whole);
    expect((await scanDiaryInbox(files, cache))[0]?.ok).toBe(true);
  });

  test("an unusable newest file is reported with the reason, not skipped for an older one", async () => {
    const files = memoryPlainFiles("automate", {
      [`${A}/20261123T203000Z.json`]: diaryEvent("2026-11-23T20:30:00Z"),
      [`${A}/20261123T210000Z.json`]: JSON.stringify({ protocol: "outer-office/automate", version: 1, kind: "event", process: "diary-sync", processVersion: 2 }),
    });
    expect(await scanDiaryInbox(files, new Map())).toEqual([
      { ok: false, principal: "PRINCIPAL-A", path: `${A}/20261123T210000Z.json`, reason: expect.stringContaining("version 2") },
    ]);
  });

  test("reads a file once while it is unchanged", async () => {
    const files = memoryPlainFiles("automate", { [`${A}/20261123T210000Z.json`]: diaryEvent() });
    const cache: InboxCache = new Map();
    await scanDiaryInbox(files, cache);
    await scanDiaryInbox(files, cache);
    expect(files.reads).toBe(1);
  });

  test("clearUpdate deletes the update and the files it replaced, and leaves newer ones", async () => {
    const files = memoryPlainFiles("automate", {
      [`${A}/20261123T203000Z.json`]: diaryEvent("2026-11-23T20:30:00Z"),
      [`${A}/20261123T210000Z.json`]: diaryEvent(),
    });
    const [entry] = await scanDiaryInbox(files, new Map());
    await files.write(`${A}/20261123T213000Z.json`, diaryEvent("2026-11-23T21:30:00Z"));
    if (!entry?.ok) throw new Error("expected an update");
    await clearUpdate(files, entry.update);
    expect([...files.files.keys()]).toEqual([`${A}/20261123T213000Z.json`]);
  });
});
