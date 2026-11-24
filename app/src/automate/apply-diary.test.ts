// @vitest-environment node
import { expect, test } from "vitest";
import type { RowOf } from "@trellis/framework";
import { MAIN_PAYLOAD } from "@/import/fixtures/diary-payload";
import { applyDiaryUpdate, type ApplyContext } from "./apply-diary";
import type { DiaryUpdate } from "./diary-inbox";

const update = { principal: "PRINCIPAL-A", path: "x.json", olderPaths: [], generatedAt: "2026-11-23T21:00:00Z", payload: MAIN_PAYLOAD } as unknown as DiaryUpdate;

test("a removed principal's folder is not applied, even though its code still matches", () => {
  let runs = 0;
  const ctx: ApplyContext = {
    principals: [{ id: "p1", code: "PRINCIPAL-A", title: "A", _deleted: true } as unknown as RowOf<"principals">],
    events: [], timeZone: "Europe/London", privatePolicy: "mask", now: "2026-11-23T21:05:00Z",
    run: () => { runs += 1; return { ok: true }; },
  };
  expect(applyDiaryUpdate(update, ctx)).toMatchObject({ kind: "refused" });
  expect(runs).toBe(0);
});
