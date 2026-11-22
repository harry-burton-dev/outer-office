// @vitest-environment node
import { describe, expect, test } from "vitest";
import { parseIcs, type ParseOptions } from "./parse-ics";
import { calendar, vevent } from "./fixtures/outlook-ics";

const OPTIONS: ParseOptions = {
  timeZone: "Europe/London",
  windowStart: "2026-01-01T00:00:00.000Z",
  windowEnd: "2027-01-01T00:00:00.000Z",
  privatePolicy: "drop",
};

const one = (lines: readonly string[], options: ParseOptions = OPTIONS) => parseIcs(calendar([vevent("u1", lines)]), options);
const first = (lines: readonly string[], options: ParseOptions = OPTIONS) => one(lines, options).events[0];
const UTC_TIMES = ["DTSTART:20260601T100000Z", "DTEND:20260601T110000Z"];

describe("showAs", () => {
  test.each([["BUSY", "busy"], ["TENTATIVE", "tentative"], ["FREE", "free"], ["OOF", "oof"]])(
    "X-MICROSOFT-CDO-BUSYSTATUS:%s gives %s", (status, expected) => {
      expect(first([...UTC_TIMES, "TRANSP:OPAQUE", `X-MICROSOFT-CDO-BUSYSTATUS:${status}`])?.showAs).toBe(expected);
    });

  test("falls back to TRANSP when there is no busy status", () => {
    expect(first([...UTC_TIMES, "TRANSP:TRANSPARENT"])?.showAs).toBe("free");
    expect(first([...UTC_TIMES, "TRANSP:OPAQUE"])?.showAs).toBe("busy");
    expect(first(UTC_TIMES)?.showAs).toBe("busy");
  });
});

describe("text fields", () => {
  test("organizer is the CN when present, else the address without mailto:", () => {
    expect(first([...UTC_TIMES, "ORGANIZER;CN=Sam Sample:mailto:sam@example.invalid"])?.organizer).toBe("Sam Sample");
    expect(first([...UTC_TIMES, "ORGANIZER:MAILTO:sam@example.invalid"])?.organizer).toBe("sam@example.invalid");
    expect(first(UTC_TIMES)?.organizer).toBe("");
  });

  test("categories from several properties are joined with a comma and space", () => {
    expect(first([...UTC_TIMES, "CATEGORIES:Red,Blue", "CATEGORIES:Green"])?.categories).toBe("Red, Blue, Green");
  });

  test("sourceModified is LAST-MODIFIED, else DTSTAMP, else empty", () => {
    const bare = (extra: readonly string[]) => parseIcs(calendar([vevent("u1", [...UTC_TIMES, ...extra], false)]), OPTIONS).events[0];
    expect(bare(["UID:u1", "LAST-MODIFIED:20260502T080000Z", "DTSTAMP:20260503T080000Z"])?.sourceModified).toBe("2026-05-02T08:00:00.000Z");
    expect(bare(["UID:u1", "DTSTAMP:20260503T080000Z"])?.sourceModified).toBe("2026-05-03T08:00:00.000Z");
    expect(bare(["UID:u1"])?.sourceModified).toBe("");
  });
});

describe("private policy", () => {
  test.each(["PRIVATE", "CONFIDENTIAL"])("CLASS:%s is dropped and counted with drop", (cls) => {
    const result = one([...UTC_TIMES, `CLASS:${cls}`, "SUMMARY:Secret"]);
    expect(result.events).toEqual([]);
    expect(result.droppedPrivate).toBe(1);
  });

  test("CLASS:CONFIDENTIAL is masked with mask, keeping times and showAs", () => {
    const result = one([...UTC_TIMES, "CLASS:CONFIDENTIAL", "SUMMARY:Secret", "LOCATION:Here", "CATEGORIES:X",
      "ORGANIZER;CN=Sam:mailto:sam@example.invalid", "X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE"], { ...OPTIONS, privatePolicy: "mask" });
    expect(result.maskedPrivate).toBe(1);
    expect(result.events[0]).toMatchObject({ subject: "Private, busy", location: "", organizer: "", categories: "",
      masked: true, showAs: "tentative", start: "2026-06-01T10:00:00.000Z", end: "2026-06-01T11:00:00.000Z" });
  });

  test("each private occurrence of a series is counted", () => {
    const result = one(["DTSTART:20260601T100000Z", "DTEND:20260601T110000Z", "RRULE:FREQ=DAILY;COUNT=3", "CLASS:PRIVATE"]);
    expect(result.droppedPrivate).toBe(3);
  });
});

describe("times", () => {
  test("floating times are read in the office time zone", () => {
    const lines = ["DTSTART:20260601T090000", "DTEND:20260601T100000"];
    expect(first(lines)?.start).toBe("2026-06-01T08:00:00.000Z");
    expect(first(lines, { ...OPTIONS, timeZone: "America/New_York" })?.start).toBe("2026-06-01T13:00:00.000Z");
  });

  test("all-day events use local midnight in the office time zone", () => {
    const event = first(["DTSTART;VALUE=DATE:20260601", "DTEND;VALUE=DATE:20260602"], { ...OPTIONS, timeZone: "America/New_York" });
    expect(event).toMatchObject({ allDay: true, start: "2026-06-01T04:00:00.000Z", end: "2026-06-02T04:00:00.000Z" });
  });

  test("an all-day event with no end lasts one day", () => {
    expect(first(["DTSTART;VALUE=DATE:20260601"])).toMatchObject({ start: "2026-05-31T23:00:00.000Z", end: "2026-06-01T23:00:00.000Z" });
  });

  test("DURATION gives the end when there is no DTEND", () => {
    expect(first(["DTSTART:20260601T100000Z", "DURATION:PT90M"])?.end).toBe("2026-06-01T11:30:00.000Z");
  });

  test("a TZID with no VTIMEZONE but a known IANA name is still honoured", () => {
    const text = calendar([vevent("u1", ["DTSTART;TZID=Europe/Paris:20260601T090000", "DTEND;TZID=Europe/Paris:20260601T100000"])], false);
    const result = parseIcs(text, OPTIONS);
    expect(result.events[0]?.start).toBe("2026-06-01T07:00:00.000Z");
    expect(result.warnings).toEqual([]);
  });

  test("an unknown TZID with no VTIMEZONE falls back to the office zone with a warning", () => {
    const text = calendar([vevent("u1", ["DTSTART;TZID=Nowhere Standard Time:20260601T090000"])], false);
    const result = parseIcs(text, OPTIONS);
    expect(result.events[0]?.start).toBe("2026-06-01T08:00:00.000Z");
    expect(result.warnings.join(" ")).toContain("Nowhere Standard Time");
  });
});

describe("recurrence", () => {
  test("RDATE adds occurrences and EXDATE removes them", () => {
    const result = one([...UTC_TIMES, "RRULE:FREQ=DAILY;COUNT=3", "RDATE:20260610T100000Z", "EXDATE:20260602T100000Z"]);
    expect(result.events.map((e) => e.start)).toEqual(["2026-06-01T10:00:00.000Z", "2026-06-03T10:00:00.000Z", "2026-06-10T10:00:00.000Z"]);
    expect(result.events.map((e) => e.recurrenceId)).toEqual(result.events.map((e) => e.start));
  });

  test("an instance moved into the window from outside it is kept; its original slot is not", () => {
    const text = calendar([
      vevent("u1", ["DTSTART:20261201T100000Z", "DTEND:20261201T110000Z", "RRULE:FREQ=DAILY;COUNT=2"]),
      vevent("u1", ["RECURRENCE-ID:20261202T100000Z", "DTSTART:20261130T100000Z", "DTEND:20261130T110000Z"]),
    ]);
    const result = parseIcs(text, { ...OPTIONS, windowEnd: "2026-12-01T00:00:00.000Z" });
    expect(result.events.map((e) => [e.recurrenceId, e.start])).toEqual([["2026-12-02T10:00:00.000Z", "2026-11-30T10:00:00.000Z"]]);
  });

  test("a cancelled series is left out entirely", () => {
    expect(one([...UTC_TIMES, "RRULE:FREQ=DAILY;COUNT=3", "STATUS:CANCELLED"]).events).toEqual([]);
  });

  test("an open-ended series stops at the window end", () => {
    expect(one([...UTC_TIMES, "RRULE:FREQ=DAILY"]).events).toHaveLength(214); // 1 Jun to 31 Dec 2026 inclusive: 30+31+31+30+31+30+31
  });

  test("events with the same start are ordered by uid", () => {
    const text = calendar([vevent("b", UTC_TIMES), vevent("a", UTC_TIMES)]);
    expect(parseIcs(text, OPTIONS).events.map((e) => e.uid)).toEqual(["a", "b"]);
  });
});

describe("bad input never throws", () => {
  test.each([["empty", ""], ["garbage", "this is not a calendar"], ["truncated", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:2026"]])(
    "%s text gives an empty result with a warning", (_name, text) => {
      const result = parseIcs(text, OPTIONS);
      expect(result.events).toEqual([]);
      expect(result.rangeStart).toBe(OPTIONS.windowStart);
      expect(result.rangeEnd).toBe(OPTIONS.windowEnd);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

  test("an event with no DTSTART is skipped with a warning", () => {
    const result = parseIcs(calendar([vevent("u1", ["SUMMARY:No start"]), vevent("u2", UTC_TIMES)]), OPTIONS);
    expect(result.events.map((e) => e.uid)).toEqual(["u2"]);
    expect(result.warnings.join(" ")).toContain("DTSTART");
  });

  test("an event with no UID is skipped with a warning", () => {
    const result = parseIcs(calendar([vevent("", ["SUMMARY:Anon", ...UTC_TIMES], false)]), OPTIONS);
    expect(result.events).toEqual([]);
    expect(result.warnings.join(" ")).toContain("UID");
  });

  test("an unknown office time zone gives an empty result with a warning", () => {
    const result = parseIcs(calendar([vevent("u1", UTC_TIMES)]), { ...OPTIONS, timeZone: "Not/AZone" });
    expect(result.events).toEqual([]);
    expect(result.warnings.length).toBe(1);
  });
});
