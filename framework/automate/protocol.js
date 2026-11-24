// The automate file protocol, version 1 (docs/automate, spec v3 section 6):
// names, folders, timestamps and the checks the client makes on a reply.
// The JSON Schemas are the contract; these checks mirror reply.schema.json so
// the client needs no schema library at run time.

export const PROTOCOL = "outer-office/automate";
export const VERSION = 1;

export const CALLS = "calls";
export const REPLIES = "replies";

export const MINUTE = 60_000;
/** A notice expires this long after it is issued (spec F8). */
export const DEFAULT_TTL_MS = 15 * MINUTE;
/**
 * How long after expiresAt the client still waits for a reply: the
 * orchestrator's 2 minutes of clock tolerance, one 2-minute sweep, and upload
 * lag on both sides.
 */
export const DEFAULT_GRACE_MS = 5 * MINUTE;
/** Replies that match no call record are deleted once they are this old (spec F9). */
export const STRAY_REPLY_MS = 48 * 60 * MINUTE;

const NAME = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;
const CALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export const isApiName = (value) => typeof value === "string" && NAME.test(value);
export const isCallId = (value) => typeof value === "string" && CALL_ID.test(value);

/**
 * UTC to the second, with no milliseconds. The orchestrator compares
 * expiresAt as a string against formatDateTime(..., 'yyyy-MM-ddTHH:mm:ssZ'),
 * which is only correct when both sides use this exact format.
 */
export function isoSeconds(ms) {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

/** The notice for one call (notice.schema.json). */
export function makeNotice({ callId, api, apiVersion, input, caller, issuedAt, expiresAt }) {
  return { protocol: PROTOCOL, version: VERSION, kind: "call", callId, api, apiVersion, input, caller, issuedAt, expiresAt };
}

/** The file a call's notice and reply are written to. Identity is the callId inside, never this name (spec F5). */
export const fileFor = (callId) => `${callId}.json`;

/** True for names the protocol reads: *.json only, so *.crswap and other temp files are skipped. */
export const isMessageFile = (name) => name.endsWith(".json");

const REPLY_KEYS = new Set(["protocol", "version", "kind", "callId", "api", "apiVersion", "status", "result", "error", "handledFor", "completedAt"]);
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Checks a parsed reply against reply.schema.json.
 * @returns {string | null} what is wrong, or null when it is a valid reply
 */
export function replyProblem(reply) {
  if (!isPlainObject(reply)) return "not an object";
  for (const key of Object.keys(reply)) if (!REPLY_KEYS.has(key)) return `unexpected field ${key}`;
  if (reply.protocol !== PROTOCOL) return "wrong protocol";
  if (reply.version !== VERSION) return "wrong version";
  if (reply.kind !== "reply") return "kind is not reply";
  if (!isCallId(reply.callId)) return "callId is not a lowercase UUID";
  if ("api" in reply && typeof reply.api !== "string") return "api is not a string";
  if ("apiVersion" in reply && !Number.isInteger(reply.apiVersion)) return "apiVersion is not an integer";
  if ("handledFor" in reply && reply.handledFor !== null && typeof reply.handledFor !== "string") return "handledFor is not a string";
  if (typeof reply.completedAt !== "string" || !ISO_UTC.test(reply.completedAt)) return "completedAt is not UTC ISO 8601";
  if (!("result" in reply) || !("error" in reply)) return "result and error are both required";
  if (reply.status === "ok") {
    if (reply.error !== null) return "an ok reply has error null";
  } else if (reply.status === "error" || reply.status === "rejected") {
    if (reply.result !== null) return `a ${reply.status} reply has result null`;
    const e = reply.error;
    if (!isPlainObject(e) || typeof e.code !== "string" || typeof e.message !== "string" || Object.keys(e).length !== 2) {
      return "error is not { code, message }";
    }
  } else {
    return "status is not ok, error or rejected";
  }
  return null;
}
