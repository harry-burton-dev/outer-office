// B1: everything the flow sends can be read on Overview.
import { describe, expect, test } from "vitest";
import example from "../../../../docs/automate/example-calendarview.json";
import { INTERNAL_KEYS, outlookFieldsOf, safeLink } from "./outlook-fields";


describe("All Outlook fields", () => {
  test("B1: every key the flow sends is shown, or is internal", () => {
    for (const item of example.value as Record<string, unknown>[]) {
      const shown = new Set(outlookFieldsOf(JSON.stringify(item)).map((f) => f.key));
      for (const key of Object.keys(item)) expect(shown.has(key) || INTERNAL_KEYS.has(key), key).toBe(true);
      for (const key of INTERNAL_KEYS) expect(shown.has(key)).toBe(false);
    }
  });

  test("an .ics item is its property lines, folded lines joined", () => {
    const ics = "BEGIN:VEVENT\r\nUID:abc\r\nSUMMARY:Board\r\n  meeting\r\nDTSTART;TZID=Europe/London:20261124T090000\r\nEND:VEVENT";
    expect(outlookFieldsOf(ics)).toEqual([
      { key: "UID", value: "abc" },
      { key: "SUMMARY", value: "Board meeting" },
      { key: "DTSTART", value: "TZID=Europe/London:20261124T090000" },
    ]);
  });

  test("a masked item (empty raw) shows nothing", () => {
    expect(outlookFieldsOf("")).toEqual([]);
  });

  test("only http and https links are followed", () => {
    expect(safeLink("https://outlook.office365.com/owa/?itemid=1")).toBe("https://outlook.office365.com/owa/?itemid=1");
    expect(safeLink("javascript:alert(1)")).toBeUndefined();
    expect(safeLink("data:text/html,x")).toBeUndefined();
    expect(safeLink("")).toBeUndefined();
  });
});
