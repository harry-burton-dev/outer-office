// The orchestrator conformance cases, C1 to C10 (flow guide F3, section 4).
// The fake orchestrator passes them in npm test, and the real flow is checked
// by hand with the same files: docs/automate/conformance/make-notices.mjs
// writes them into the synced folder with fresh times.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const iso = (ms) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
const json = (value) => JSON.stringify(value, null, 2);

/**
 * @typedef {{ status: "ok" | "error" | "rejected", code: string | null, echoesApi: boolean }} ExpectedReply
 * @typedef {{ id: string, title: string, files: { name: string, text: string }[],
 *   callId: string | null, reply: ExpectedReply | null,
 *   staysFor: "answered" | "15 minutes" | "ever" }} Case
 *
 * `reply` is the one reply expected for `callId`, or null for none.
 * `staysFor` is how long the case's files stay in calls/: until answered,
 * until 15 minutes after they were written, or for ever (the flow never
 * touches them).
 *
 * @param {{ now: number, principal: string, unknownPrincipal?: string, newId: () => string }} options
 * @returns {Case[]}
 */
export function buildCases({ now, principal, unknownPrincipal = "NO-SUCH-PRINCIPAL", newId }) {
  const window = {
    principal,
    windowStart: iso(now - 7 * DAY).slice(0, 10) + "T00:00:00Z",
    windowEnd: iso(now + 14 * DAY).slice(0, 10) + "T00:00:00Z",
  };
  const notice = (over = {}) => ({
    protocol: "outer-office/automate",
    version: 1,
    kind: "call",
    callId: newId(),
    api: "diary.fetch",
    apiVersion: 1,
    input: window,
    caller: { user: "conformance", app: "make-notices" },
    issuedAt: iso(now),
    expiresAt: iso(now + 15 * MINUTE),
    ...over,
  });
  const one = (id, title, name, body, reply, staysFor = "answered") => ({
    id,
    title,
    files: [{ name, text: typeof body === "string" ? body : json(body) }],
    callId: typeof body === "string" ? null : body.callId,
    reply,
    staysFor,
  });
  const ok = { status: "ok", code: null, echoesApi: true };
  const c2 = notice();

  return [
    one("C1", "A valid diary.fetch", "c1.json", notice(), ok),
    {
      id: "C2",
      title: "The same notice twice, as a file and its copy: one reply",
      files: [
        { name: "c2.json", text: json(c2) },
        { name: "c2 (1).json", text: json(c2) },
      ],
      callId: c2.callId,
      reply: ok,
      staysFor: "answered",
    },
    one("C3", "An API that does not exist", "c3.json", notice({ api: "nope" }), { status: "rejected", code: "unknown-api", echoesApi: true }),
    one("C4", "Protocol version 2: rejected, with no api or apiVersion", "c4.json", notice({ version: 2 }), { status: "rejected", code: "invalid-or-expired", echoesApi: false }),
    one("C5", "Expired an hour ago", "c5.json", notice({ issuedAt: iso(now - 75 * MINUTE), expiresAt: iso(now - 60 * MINUTE) }), { status: "rejected", code: "invalid-or-expired", echoesApi: false }),
    one("C6", "Not JSON: no reply, deleted 15 minutes after it was written", "c6.json", "this is { not json", null, "15 minutes"),
    one("C7", "A principal not in principals.json", "c7.json", notice({ input: { ...window, principal: unknownPrincipal } }), { status: "error", code: "child-failed", echoesApi: true }),
    one("C8", "A browser temp file: never read, never deleted", "c8.json.crswap", "{}", null, "ever"),
    one("C9", "A window that ends before it starts", "c9.json", notice({ input: { principal, windowStart: window.windowEnd, windowEnd: window.windowStart } }), { status: "rejected", code: "invalid-or-expired", echoesApi: true }),
    {
      ...one("C10", "An unsafe callId: no reply, nothing outside replies/, deleted after 15 minutes", "c10.json", notice({ callId: "../config/principals" }), null, "15 minutes"),
      callId: null,
    },
  ];
}

/** A stand-in for the "Diary · read window" child flow (F1), knowing the given principals. */
export function diaryFetchStub(known = ["PRINCIPAL-A"]) {
  return ({ principal, windowStart, windowEnd }) => {
    if (!known.includes(principal)) throw new Error("No mailbox for this principal");
    return { principal, windowStart, windowEnd, count: 0, events: [], masters: [] };
  };
}
