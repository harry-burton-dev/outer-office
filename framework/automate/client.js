// The automate client (OUT-54): calls Power Automate through plain files.
//
//   call(api, input)  writes calls/<callId>.json and records the call as pending
//   tick()            reads replies/, settles the calls they answer, deletes the
//                     reply files, and times out calls that waited too long
//
// The client is given the `automate/` directory handle and never touches the
// encrypted data. Every rule here is from spec v3:
//  - one file per message, data inline (F1)
//  - a file that does not parse yet is "not yet", tried again next tick (F3)
//  - identity is the callId inside the file, so conflict copies are
//    duplicates and are deleted with the original (F5)
//  - applying is idempotent and records show status, not a lock (F7)
//  - expiresAt is issuedAt + 15 minutes; after that plus a grace period the
//    call is timed out and its notice deleted if still there (F8)

import { ensureDir, listFiles, notFound, replaceFile } from "../engine/src/engine/folder-io.js";
import {
  CALLS,
  DEFAULT_GRACE_MS,
  DEFAULT_TTL_MS,
  REPLIES,
  STRAY_REPLY_MS,
  fileFor,
  isApiName,
  isMessageFile,
  isoSeconds,
  makeNotice,
  replyProblem,
} from "./protocol.js";

/** Reply status -> call record status. */
const SETTLED = { ok: "done", error: "failed", rejected: "rejected" };

/**
 * In-memory call records. A synced table replaces this in the next slice; it
 * only has to offer the same three methods.
 */
export function memoryRecords() {
  const rows = new Map();
  return {
    get: (callId) => rows.get(callId),
    put: (record) => void rows.set(record.callId, { ...record }),
    all: () => [...rows.values()],
  };
}

const decoder = new TextDecoder();

async function readJson(handle) {
  const file = await handle.getFile();
  const text = decoder.decode(await file.arrayBuffer());
  try {
    return { lastModified: file.lastModified, value: JSON.parse(text) };
  } catch {
    return { lastModified: file.lastModified, unreadable: true };
  }
}

async function removeQuietly(dir, name) {
  try {
    await dir.removeEntry(name);
  } catch (err) {
    if (!notFound(err)) throw err;
  }
}

/**
 * @param {object} options
 * @param {FileSystemDirectoryHandle} options.dir  the `automate/` folder
 * @param {{ user: string, app: string }} options.caller
 * @param {() => number} [options.now]
 * @param {() => string} [options.newId]  a lowercase UUID
 * @param {ReturnType<typeof memoryRecords>} [options.records]
 * @param {number} [options.ttlMs]
 * @param {number} [options.graceMs]
 */
export function createAutomateClient({
  dir,
  caller,
  now = Date.now,
  newId = () => crypto.randomUUID(),
  records = memoryRecords(),
  ttlMs = DEFAULT_TTL_MS,
  graceMs = DEFAULT_GRACE_MS,
}) {
  if (!caller || typeof caller.user !== "string" || typeof caller.app !== "string") {
    throw new TypeError("caller must be { user, app }");
  }

  async function call(api, input, { apiVersion = 1 } = {}) {
    if (!isApiName(api)) throw new TypeError(`not an API name: ${api}`);
    if (!Number.isInteger(apiVersion) || apiVersion < 1) throw new TypeError(`apiVersion must be a whole number from 1: ${apiVersion}`);
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new TypeError("input must be an object");
    const callId = newId();
    const at = now();
    const issuedAt = isoSeconds(at);
    const expiresAt = isoSeconds(at + ttlMs);
    const notice = makeNotice({ callId, api, apiVersion, input, caller, issuedAt, expiresAt });
    const calls = await ensureDir(dir, [CALLS]);
    await replaceFile(calls, fileFor(callId), new TextEncoder().encode(JSON.stringify(notice)));
    const record = { callId, api, apiVersion, status: "pending", issuedAt, expiresAt, settledAt: null, error: null };
    records.put(record);
    return { ...record };
  }

  function settle(record, status, error) {
    const settled = { ...record, status, error, settledAt: isoSeconds(now()) };
    records.put(settled);
    return settled;
  }

  async function readReplies(replies) {
    const byCallId = new Map();
    const strays = [];
    for (const { name, handle } of await listFiles(replies)) {
      if (!isMessageFile(name)) continue;
      let read;
      try {
        read = await readJson(handle);
      } catch {
        continue; // deleted under us, or a read failure: "not yet", like a half-written file
      }
      const callId = read.value?.callId;
      if (read.unreadable || typeof callId !== "string") {
        strays.push({ name, lastModified: read.lastModified });
        continue;
      }
      const entry = byCallId.get(callId) ?? { names: [], reply: read.value, lastModified: read.lastModified };
      entry.names.push(name);
      byCallId.set(callId, entry);
    }
    return { byCallId, strays };
  }

  /**
   * One pass over replies/. Safe to run on every engine tick, and from every
   * device at once.
   * @returns {Promise<{ settled: object[], timedOut: object[] }>} records that
   *   changed in this pass; each settled one carries `result` when it is done
   */
  async function tick() {
    const replies = await ensureDir(dir, [REPLIES]);
    const { byCallId, strays } = await readReplies(replies);
    const settled = [];
    const t = now();

    for (const [callId, { names, reply, lastModified }] of byCallId) {
      const record = records.get(callId);
      if (!record) {
        // Another device's call whose record has not synced here yet, or a
        // call nobody remembers. Leave it, unless it is old.
        if (t - lastModified > STRAY_REPLY_MS) for (const name of names) await removeQuietly(replies, name);
        continue;
      }
      if (record.status === "pending") {
        const problem = replyProblem(reply);
        const done = problem
          ? settle(record, "failed", { code: "bad-reply", message: problem })
          : settle(record, SETTLED[reply.status], reply.error);
        settled.push(problem || reply.status !== "ok" ? done : { ...done, result: reply.result });
      }
      // Settled now or earlier (a late reply after a timeout, or a copy): the files are done with.
      for (const name of names) await removeQuietly(replies, name);
    }

    for (const { name, lastModified } of strays) {
      if (t - lastModified > STRAY_REPLY_MS) await removeQuietly(replies, name);
    }

    const timedOut = [];
    for (const record of records.all()) {
      if (record.status !== "pending" || byCallId.has(record.callId)) continue;
      if (t <= Date.parse(record.expiresAt) + graceMs) continue;
      timedOut.push(settle(record, "timed-out", { code: "timed-out", message: "No reply before the call expired" }));
      const calls = await ensureDir(dir, [CALLS]);
      await removeQuietly(calls, fileFor(record.callId));
    }

    return { settled, timedOut };
  }

  return { call, tick, records };
}
