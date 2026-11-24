// The item as received, as key and value text for "All Outlook fields"
// (OUT-83, v0.3-brief.md section 8). Graph JSON and a CSV row are objects;
// an .ics VEVENT is its property lines. Pure.

/** Keys of the Graph item that say nothing about the meeting. */
export const INTERNAL_KEYS: ReadonlySet<string> = new Set(["@odata.etag", "changeKey", "transactionId"]);

export interface OutlookField {
  key: string;
  value: string;
}

const textOf = (value: unknown): string =>
  value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 1);

export function outlookFieldsOf(raw: string): OutlookField[] {
  if (raw.trim() === "") return [];
  if (raw.trimStart().startsWith("{")) {
    try {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.entries(value).filter(([key]) => !INTERNAL_KEYS.has(key)).map(([key, v]) => ({ key, value: textOf(v) }));
      }
    } catch {
      // Not JSON: read it as .ics lines below.
    }
  }
  // An .ics line folded over several (RFC 5545 3.1) is one line.
  return raw.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).filter((line) => /^[A-Z-]+[;:]/i.test(line) && !/^(BEGIN|END):/i.test(line)).map((line) => {
    const at = line.search(/[;:]/);
    return { key: line.slice(0, at), value: line.slice(at + 1) };
  });
}

/** An http(s) link, or undefined: a stored link is never followed as anything else. */
export function safeLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
