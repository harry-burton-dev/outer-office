// @vitest-environment node
import { describe, expect, test } from "vitest";
import { parseQuickAdd } from "./quick-add";

// Sunday 22 November 2026.
const context = { today: "2026-11-22" };
const parse = (text: string) => parseQuickAdd(text, context);

describe("parseQuickAdd: plain titles", () => {
  test("a title with no tokens comes back as typed, whitespace collapsed", () => {
    expect(parse("  Draft   the   note ")).toEqual({ title: "Draft the note" });
  });

  test("an empty string gives an empty title", () => {
    expect(parse("")).toEqual({ title: "" });
  });
});

describe("parseQuickAdd: tokens", () => {
  test("reads a one-word project", () => {
    expect(parse("Draft note #Admin")).toEqual({ title: "Draft note", project: "Admin" });
  });

  test("reads a project with spaces and hyphens up to the next marker", () => {
    expect(parse("Draft note #Board papers re-draft p2 +user-b")).toEqual({
      title: "Draft note", project: "Board papers re-draft", priority: 2, assignee: "user-b",
    });
  });

  test("a project ends at a due date", () => {
    expect(parse("Draft note #Board papers tomorrow")).toEqual({ title: "Draft note", project: "Board papers", due: "2026-11-23" });
  });

  test("reads a section, priority, person and principal", () => {
    expect(parse("Book room /Logistics p1 +user-a ^PRINCIPAL-A")).toEqual({
      title: "Book room", section: "Logistics", priority: 1, assignee: "user-a", principal: "PRINCIPAL-A",
    });
  });

  test("reads tokens wherever they sit in the text", () => {
    expect(parse("p3 Book ^PRINCIPAL-B room")).toEqual({ title: "Book room", priority: 3, principal: "PRINCIPAL-B" });
  });

  test("accepts upper-case priority", () => {
    expect(parse("Book room P4").priority).toBe(4);
  });

  test("keeps a second token of the same kind in the title", () => {
    expect(parse("Book room p1 p2")).toEqual({ title: "Book room p2", priority: 1 });
  });

  test("a bare marker with nothing after it stays in the title", () => {
    expect(parse("Plan # / + ^ for later")).toEqual({ title: "Plan # / + ^ for later" });
  });
});

describe("parseQuickAdd: due dates", () => {
  test.each([
    ["today", "2026-11-22"],
    ["tomorrow", "2026-11-23"],
    ["Tomorrow", "2026-11-23"],
    ["monday", "2026-11-23"],
    ["fri", "2026-11-27"],
    ["Sunday", "2026-11-29"],
    ["27 nov", "2026-11-27"],
    ["27 November", "2026-11-27"],
    ["27/11", "2026-11-27"],
    ["2026-11-27", "2026-11-27"],
    ["3 jan", "2027-01-03"],
    ["3/1", "2027-01-03"],
  ])("reads %s", (words, due) => {
    expect(parse(`Send pack ${words}`)).toEqual({ title: "Send pack", due });
  });

  test("a weekday means the next such day, never today", () => {
    expect(parse("Send pack sun").due).toBe("2026-11-29");
  });

  test("a date that does not exist stays in the title", () => {
    expect(parse("Send pack 31/11")).toEqual({ title: "Send pack 31/11" });
    expect(parse("Send pack 2026-02-30")).toEqual({ title: "Send pack 2026-02-30" });
  });

  test("a second date stays in the title", () => {
    expect(parse("Move today to tomorrow")).toEqual({ title: "Move to tomorrow", due: "2026-11-22" });
  });

  test("a number without a month stays in the title", () => {
    expect(parse("Order 27 chairs")).toEqual({ title: "Order 27 chairs" });
  });
});

describe("parseQuickAdd: deadlines", () => {
  test("reads a deadline in braces", () => {
    expect(parse("Send pack {27 nov}")).toEqual({ title: "Send pack", deadline: "2026-11-27" });
  });

  test("reads every date form in braces", () => {
    expect(parse("Send pack {friday}").deadline).toBe("2026-11-27");
    expect(parse("Send pack {27/11}").deadline).toBe("2026-11-27");
    expect(parse("Send pack { 2026-12-01 }").deadline).toBe("2026-12-01");
  });

  test("reads a due date and a deadline together", () => {
    expect(parse("Send pack tomorrow {27 nov} p1")).toEqual({ title: "Send pack", due: "2026-11-23", deadline: "2026-11-27", priority: 1 });
  });

  test("braces that do not hold a date stay in the title", () => {
    expect(parse("Fix {draft} copy")).toEqual({ title: "Fix {draft} copy" });
  });
});

describe("parseQuickAdd: text that only looks like a token", () => {
  test("p1 inside a word is not a priority", () => {
    expect(parse("Replace mp1 cable and p12 form")).toEqual({ title: "Replace mp1 cable and p12 form" });
  });

  test("an email address is not a person or a project", () => {
    expect(parse("Email someone+tag@example.com about it")).toEqual({ title: "Email someone+tag@example.com about it" });
  });

  test("a slash inside a word or a date is not a section", () => {
    expect(parse("Check and/or confirm 12/13")).toEqual({ title: "Check and/or confirm 12/13" });
  });

  test("a hash inside a word is not a project", () => {
    expect(parse("Learn C# basics")).toEqual({ title: "Learn C# basics" });
  });

  test("a phone number is not a person", () => {
    expect(parse("Ring +44 number")).toEqual({ title: "Ring +44 number" });
  });

  test("words like todays are not dates", () => {
    expect(parse("Read todays papers")).toEqual({ title: "Read todays papers" });
  });
});
