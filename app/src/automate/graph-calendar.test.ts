// @vitest-environment node
import { describe, expect, test } from "vitest";
import { MAIN_PAYLOAD, MAIN_PAYLOAD_EVENTS, MASTER_ID } from "@/import/fixtures/diary-payload";
import { UID } from "@/import/fixtures/outlook-ics";
import { parseAutomate } from "@/import/parse-automate";
import { readGraphCalendar, stampOf, windowOf } from "./graph-calendar";
import { graphResponse } from "./testing/graph-file";

const MASK = { timeZone: "Europe/London", privatePolicy: "mask" } as const;
const NAME = "20261019T090000Z.json";

describe("readGraphCalendar", () => {
  test("Graph's raw response gives the same events as the .ics file of the same diary", () => {
    const read = readGraphCalendar(graphResponse(), "PRINCIPAL-A", NAME);
    if (!read.ok) throw new Error(read.reason);
    expect(parseAutomate(read.payload, MASK).events).toEqual(parseAutomate(MAIN_PAYLOAD, MASK).events);
  });

  test("a series' UID is its occurrences' iCalUId with the instance date zeroed", () => {
    const read = readGraphCalendar(graphResponse(), "PRINCIPAL-A", NAME);
    expect(read.ok && read.payload.masters).toEqual([
      { id: MASTER_ID.weeklyReview, iCalUId: UID.weeklyReview },
      { id: MASTER_ID.standUp, iCalUId: UID.standUp },
      { id: MASTER_ID.projectSync, iCalUId: UID.projectSync },
    ]);
  });

  test("a series whose occurrences don't share one UID is keyed by its Graph id", () => {
    const raw = graphResponse({ ...MAIN_PAYLOAD, masters: [] });
    const read = readGraphCalendar(raw, "PRINCIPAL-A", NAME);
    expect(read.ok && read.payload.masters?.find((m) => m.id === MASTER_ID.standUp)).toEqual({ id: MASTER_ID.standUp, iCalUId: `graph-series:${MASTER_ID.standUp}` });
  });

  test("the window is 7 days before the run's UTC day to 60 days after, from the file's name", () => {
    expect(stampOf("20261019T213000Z (1).json")).toBe("2026-10-19T21:30:00Z");
    expect(windowOf("2026-10-19T21:30:00Z")).toEqual({ windowStart: "2026-10-12T00:00:00.000Z", windowEnd: "2026-12-18T00:00:00.000Z" });
    const read = readGraphCalendar(graphResponse(), "PRINCIPAL-A", NAME);
    expect(read.ok && [read.payload.windowStart, read.payload.count]).toEqual(["2026-10-12T00:00:00.000Z", MAIN_PAYLOAD_EVENTS.length]);
  });

  test("reads Graph's location, organizer and missing subject", () => {
    const [first] = graphResponse().value as Record<string, unknown>[];
    const event = { ...first, subject: undefined, location: { displayName: "Room 9" }, organizer: { emailAddress: { name: "", address: "sam@example.invalid" } } };
    const read = readGraphCalendar({ value: [event] }, "PRINCIPAL-A", NAME);
    expect(read.ok && read.payload.events[0]).toMatchObject({ subject: "", location: "Room 9", organizer: "sam@example.invalid" });
  });

  test.each([
    ["notes.json", { value: [] }, "is not the time the flow ran"],
    [NAME, { error: { code: "ErrorAccessDenied", message: "Access is denied." } }, "error from Outlook: Access is denied"],
    [NAME, { items: [] }, "not the response of a calendarView request"],
    [NAME, { value: [], "@odata.nextLink": "https://graph.microsoft.com/next" }, "$top=999"],
    [NAME, { value: [{ ...(graphResponse().value[0] as object), type: undefined }] }, "no type. Check the $select"],
    [NAME, { value: [{ ...(graphResponse().value[0] as object), start: "2026-10-12T08:00:00" }] }, "no start or end"],
    [NAME, { value: [{ ...(graphResponse().value[0] as object), sensitivity: "secret" }] }, "sensitivity"],
  ])("refuses %s %j, saying why", (name, value, reason) => {
    const read = readGraphCalendar(value, "PRINCIPAL-A", name);
    expect(read.ok).toBe(false);
    expect(!read.ok && read.reason).toContain(reason);
  });
});
