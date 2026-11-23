// Test helper (not shipped): a diary-sync event file's text, as flow F2 writes it.
import { MAIN_PAYLOAD } from "@/import/fixtures/diary-payload";

export const diaryEvent = (generatedAt = "2026-11-23T21:00:00Z", data: unknown = MAIN_PAYLOAD): string =>
  JSON.stringify({ protocol: "outer-office/automate", version: 1, kind: "event", process: "diary-sync", processVersion: 1, generatedAt, data });
