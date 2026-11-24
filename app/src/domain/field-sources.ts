// Where each of an engagement's Outlook fields came from, and how old it is
// (OUT-83, v0.3-brief.md section 8: "each field on Overview shows its source
// and age"). A field's value was last confirmed by the newest of: its last
// history row, and the newest import that covered the engagement and carries
// the field. Pure.
import type { RowOf } from "@trellis/framework";
import { carries } from "@/import/compare";

type Event = RowOf<"events">;
type History = RowOf<"eventHistory">;
type Import = RowOf<"imports">;

export interface FieldSource {
  /** automate, ics, csv, or "" when not known. */
  source: string;
  /** ISO UTC. */
  at: string;
}

export const SOURCE_NAMES: Readonly<Record<string, string>> = { automate: "the Outlook sync", ics: "an .ics file", csv: "a CSV file" };

const covers = (i: Import, event: Event): boolean =>
  !i._deleted && i.principal === event.principal && (i.rangeStart ?? "") <= (event.start ?? "") && (event.start ?? "") <= (i.rangeEnd ?? "");

export function fieldSource(field: string, event: Event, history: readonly History[], imports: readonly Import[]): FieldSource | undefined {
  const changed = history
    .filter((h) => !h._deleted && h.event === event.id && h.field === field)
    .reduce<History | undefined>((latest, h) => ((h.at ?? "") > (latest?.at ?? "") ? h : latest), undefined);
  const confirmed = imports
    .filter((i) => covers(i, event) && i.source && carries(i.source, field))
    .reduce<Import | undefined>((latest, i) => ((i.at ?? "") > (latest?.at ?? "") ? i : latest), undefined);
  const written = imports.find((i) => i.id === event.importId && !i._deleted);
  const candidates: FieldSource[] = [
    ...(changed ? [{ source: changed.source ?? "", at: changed.at ?? "" }] : []),
    ...(confirmed ? [{ source: confirmed.source ?? "", at: confirmed.at ?? "" }] : []),
    ...(written ? [{ source: written.source || event.source || "", at: written.at ?? "" }] : []),
  ];
  return candidates.reduce<FieldSource | undefined>((best, c) => (c.at > (best?.at ?? "") ? c : best), undefined);
}
