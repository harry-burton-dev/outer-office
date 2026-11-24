// B3: each field on Overview shows where it came from and how old it is.
import type { RowOf } from "@trellis/framework";
import { describe, expect, test } from "vitest";
import { fieldSource } from "./field-sources";

const event = { id: "e1", principal: "p1", start: "2026-11-24T09:00:00Z", importId: "i1", source: "ics" } as RowOf<"events">;
const imp = (id: string, at: string, source: string, extra: Partial<RowOf<"imports">> = {}) =>
  ({ id, at, source, principal: "p1", rangeStart: "2026-11-01T00:00:00Z", rangeEnd: "2026-12-31T00:00:00Z", ...extra }) as RowOf<"imports">;
const hist = (field: string, at: string, source: string) => ({ id: `h-${field}-${at}`, event: "e1", field, at, source }) as RowOf<"eventHistory">;

describe("field source and age", () => {
  test("a field with no history is as old as the import that wrote the event", () => {
    expect(fieldSource("subject", event, [], [imp("i1", "2026-11-20T08:00:00Z", "ics")])).toEqual({ source: "ics", at: "2026-11-20T08:00:00Z" });
  });

  test("a later import that carries the field confirms it", () => {
    const imports = [imp("i1", "2026-11-20T08:00:00Z", "ics"), imp("i2", "2026-11-23T08:00:00Z", "automate")];
    expect(fieldSource("subject", event, [], imports)).toEqual({ source: "automate", at: "2026-11-23T08:00:00Z" });
  });

  test("an import that doesn't carry the field, or doesn't cover the event, doesn't confirm it", () => {
    const imports = [
      imp("i1", "2026-11-20T08:00:00Z", "ics"),
      imp("i2", "2026-11-23T08:00:00Z", "csv"),
      imp("i3", "2026-11-24T08:00:00Z", "automate", { rangeEnd: "2026-11-10T00:00:00Z" }),
      imp("i4", "2026-11-24T09:00:00Z", "automate", { principal: "p2" }),
    ];
    expect(fieldSource("joinUrl", event, [], imports)).toEqual({ source: "ics", at: "2026-11-20T08:00:00Z" });
  });

  test("the newest history row wins over an older confirmation", () => {
    const imports = [imp("i1", "2026-11-20T08:00:00Z", "ics")];
    const history = [hist("subject", "2026-11-21T08:00:00Z", "ics"), hist("subject", "2026-11-22T08:00:00Z", "automate"), hist("start", "2026-11-23T08:00:00Z", "ics")];
    expect(fieldSource("subject", event, history, imports)).toEqual({ source: "automate", at: "2026-11-22T08:00:00Z" });
  });

  test("nothing known gives no source", () => {
    expect(fieldSource("subject", event, [], [])).toBeUndefined();
  });
});
