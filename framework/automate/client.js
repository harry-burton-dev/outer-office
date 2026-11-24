// The automate client (OUT-54): calls Power Automate through plain files.
//
//   call(api, input)  writes calls/<callId>.json and records the call as pending
//   tick()            reads replies/, settles the calls they answer, deletes the
//                     reply files, and times out calls that waited too long
//
// The client is given the app's PlainFiles for `automate/`
// (useSession().plainFiles("automate")) and never touches the encrypted data. Every rule here is from spec v3:
//  - one file per message, data inline (F1)
//  - a file that does not parse yet is "not yet", tried again next tick (F3)
//  - identity is the callId inside the file, so conflict copies are
//    duplicates and are deleted with the original (F5)
//  - applying is idempotent and records show status, not a lock (F7)
//  - expiresAt is issuedAt + 15 minutes; after that plus a grace period the
//    call is timed out and its notice deleted if still there (F8)

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

/**
 * @param {object} options
 * @param {import("../plainfiles/plain-files.ts").PlainFiles} options.files  plain files for `automate/`
 * @param {{ user: string, app: string }} options.caller
 * @param {() => number} [options.now]
 * @param {() => string} [options.newId]  a lowercase UUID
 * @param {ReturnType<typeof memoryRecords>} [options.records]
 * @param {number} [options.ttlMs]
 * @param {number} [options.graceMs]
 */
export function createAutomateClient({
  files,
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
    await files.writeJson(`${CALLS}/${fileFor(callId)}`, notice);
    const record = { callId, api, apiVersion, status: "pending", issuedAt, expiresAt, settledAt: null, error: null };
    records.put(record);
    return { ...record };
  }

  function settle(record, status, error) {
    const settled = { ...record, status, error, settledAt: isoSeconds(now()) };
    records.put(settled);
    return settled;
  }

  async function readReplies() {
    const byCallId = new Map();
    const strays = [];
    for (const { name, path, lastModified } of await files.list(REPLIES)) {
      if (!isMessageFile(name)) continue;
      const read = await files.readJson(path);
      if (!read.ok && read.reason !== "incomplete") continue; // gone, or the read failed: next tick
      const callId = read.ok ? read.value?.callId : undefined;
      if (typeof callId !== "string") {
        strays.push({ path, lastModified }); // half-arrived, or junk
        continue;
      }
      const entry = byCallId.get(callId) ?? { paths: [], reply: read.value, lastModified };
      entry.paths.push(path);
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
    const { byCallId, strays } = await readReplies();
    const settled = [];
    const t = now();

    for (const [callId, { paths, reply, lastModified }] of byCallId) {
      const record = records.get(callId);
      if (!record) {
        // Another device's call whose record has not synced here yet, or a
        // call nobody remembers. Leave it, unless it is old.
        if (t - lastModified > STRAY_REPLY_MS) for (const path of paths) await files.delete(path);
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
      for (const path of paths) await files.delete(path);
    }

    for (const { path, lastModified } of strays) {
      if (t - lastModified > STRAY_REPLY_MS) await files.delete(path);
    }

    const timedOut = [];
    for (const record of records.all()) {
      if (record.status !== "pending" || byCallId.has(record.callId)) continue;
      if (t <= Date.parse(record.expiresAt) + graceMs) continue;
      timedOut.push(settle(record, "timed-out", { code: "timed-out", message: "No reply before the call expired" }));
      await files.delete(`${CALLS}/${fileFor(record.callId)}`);
    }

    return { settled, timedOut };
  }

  return { call, tick, records };
}
