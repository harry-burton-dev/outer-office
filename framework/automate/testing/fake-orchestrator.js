// A fake of the "Automate · orchestrator" flow, for tests. It follows flow
// guide F3 version 2 (OO1 notes, flow-f3-orchestrator.md) step for step, on a
// folder handle, so the client can be tested without a real flow. The
// conformance cases in conformance.js are the checklist the real flow must
// also pass. It reads and writes through PlainFiles on the flow's own device,
// whose list() already leaves out .crswap and other temp files.
//
// One sweep, as F3 runs every 2 minutes with concurrency 1:
//   1. list calls/ and replies/; keep only *.json notices; handled = []
//   2. for each notice:
//      2.2 written over 15 minutes ago -> delete it, no reply
//      2.3 read it; not JSON yet -> leave it
//      2.4 callId not safe as a file name -> leave it (2.2 deletes it later)
//      2.5 a reply exists, or this sweep handled the callId -> delete it
//      2.6 envelope fails -> rejected, invalid-or-expired, with no api or apiVersion
//      2.7 route api@apiVersion: no case -> rejected, unknown-api;
//          diary.fetch input bad -> rejected, invalid-or-expired;
//          the child throws -> error, child-failed
//      2.8 write replies/<callId>.json, add to handled, then delete the notice

import { CALLS, MINUTE, PROTOCOL, REPLIES, VERSION, isMessageFile, isoSeconds } from "../protocol.js";

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v) => typeof v === "string";

/** F3 2.4: the callId becomes a file name, so it must not reach outside replies/. */
export function answerable(callId) {
  return callId.length === 36 && callId.split("-").length === 5 && !/[/\\.:]/.test(callId);
}

/** F3 2.6: the Parse JSON schema (types and required fields), then the envelope and expiry check. */
function envelopeOk(n, now) {
  const typed =
    isString(n.protocol) && Number.isInteger(n.version) && isString(n.kind) && isString(n.callId) &&
    isString(n.api) && Number.isInteger(n.apiVersion) && isObject(n.input) &&
    isObject(n.caller) && isString(n.caller.user) && isString(n.caller.app) &&
    Object.keys(n.caller).every((k) => k === "user" || k === "app") &&
    isString(n.issuedAt) && isString(n.expiresAt);
  // expiresAt is compared as a string, as the flow does it.
  return typed && n.protocol === PROTOCOL && n.version === VERSION && n.kind === "call" && n.expiresAt > isoSeconds(now - 2 * MINUTE);
}

/** F3 2.7, diary.fetch@1: the input schema's types, then "Window ok". */
function fetchInputOk(input) {
  return isString(input.principal) && input.principal !== "" && isString(input.windowStart) && isString(input.windowEnd) && input.windowStart < input.windowEnd;
}

/**
 * @param {object} options
 * @param {import("../../plainfiles/plain-files.ts").PlainFiles} options.files  `automate/`, as the flow's device sees it
 * @param {() => number} options.now
 * @param {Record<string, (input: any) => any>} [options.apis]  "api@version" -> child flow
 * @param {string | null} [options.handledFor]  what the listing's LastModifiedBy would say
 */
export function createFakeOrchestrator({ files, now, apis = {}, handledFor = null }) {
  const log = [];

  const reply = (callId, status, result, error, echo) => ({
    protocol: PROTOCOL,
    version: VERSION,
    kind: "reply",
    callId,
    ...(echo && { api: echo.api, apiVersion: echo.apiVersion }),
    status,
    result,
    error,
    handledFor,
    completedAt: isoSeconds(now()),
  });

  async function answer(callId, notice) {
    if (!envelopeOk(notice, now())) {
      return reply(callId, "rejected", null, { code: "invalid-or-expired", message: "Envelope or expiry check failed" });
    }
    const key = `${notice.api}@${notice.apiVersion}`;
    const child = apis[key];
    if (!child) return reply(callId, "rejected", null, { code: "unknown-api", message: `No API ${notice.api} v${notice.apiVersion}` }, notice);
    if (key === "diary.fetch@1" && !fetchInputOk(notice.input)) {
      return reply(callId, "rejected", null, { code: "invalid-or-expired", message: "diary.fetch needs principal, windowStart and windowEnd, with windowStart before windowEnd" }, notice);
    }
    try {
      return reply(callId, "ok", await child(notice.input), null, notice);
    } catch (err) {
      return reply(callId, "error", null, { code: "child-failed", message: String(err?.message ?? err) }, notice);
    }
  }

  async function sweep() {
    // Not in F3: the flow's Create file is one upload, but this fake writes
    // like a browser, and a failed write leaves an empty file behind. An
    // empty reply must not count as an answer, or the retry never happens.
    const replyNames = new Set((await files.list(REPLIES)).filter((f) => f.size > 0).map((f) => f.name.toLowerCase()));
    const handled = new Set();

    for (const { name, path, lastModified } of await files.list(CALLS)) {
      if (!isMessageFile(name.toLowerCase())) continue;
      const step = async () => {
        if (!(lastModified > now() - 15 * MINUTE)) {
          await files.delete(path);
          return "deleted-old";
        }
        const read = await files.readJson(path);
        if (!read.ok) return read.reason === "incomplete" ? "not-json" : "unreadable";
        const notice = read.value;
        if (!isObject(notice)) return "not-json";
        const callId = String(notice.callId ?? "").toLowerCase();
        if (!answerable(callId)) return "unsafe-call-id";
        if (replyNames.has(`${callId}.json`) || handled.has(callId)) {
          await files.delete(path);
          return "duplicate";
        }
        const out = await answer(callId, notice);
        await files.write(`${REPLIES}/${callId}.json`, JSON.stringify(out));
        handled.add(callId);
        await files.delete(path);
        return `${out.status}${out.error ? ` ${out.error.code}` : ""}`;
      };
      try {
        log.push({ name, outcome: await step() });
      } catch {
        log.push({ name, outcome: "action-failed" }); // the run fails here; the next run tries again
      }
    }
  }

  return { sweep, log };
}
