// Which principals the switch offers, and which one is chosen.
import { useMemo } from "react";
import { useRecords, type RowOf } from "@trellis/framework";
import { byOrder } from "@/domain/selectors";

export type Principal = RowOf<"principals">;

/** Live principals marked active, by order. */
export function activePrincipals(rows: readonly Principal[]): Principal[] {
  return rows.filter((p) => !p._deleted && p.active === true).sort(byOrder);
}

/** The chosen id while it is still active, otherwise the first active principal, or null when there are none. */
export function resolvePrincipal(active: readonly Principal[], chosen: string | null): string | null {
  return active.some((p) => p.id === chosen) ? chosen : (active[0]?.id ?? null);
}

export function useActivePrincipals(): Principal[] {
  const rows = useRecords("principals");
  return useMemo(() => activePrincipals(rows), [rows]);
}
