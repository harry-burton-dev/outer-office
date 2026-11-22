// Fractional ordering: a new item's order sits between its neighbours', so
// moving one item rewrites only that item.

const STEP = 1;

/**
 * An order between `before` (the item above) and `after` (the item below).
 * Either may be missing at the ends of a list. When the neighbours are tied or
 * out of order there is no number between them, so the item ties with `before`
 * and the list falls back to its tie-break (the id).
 * Repeated inserts at one spot halve the gap each time; doubles allow about 50
 * such inserts before two orders become equal.
 */
export function between(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return STEP;
  if (after === undefined) return Math.floor(before as number) + STEP;
  if (before === undefined) return Math.ceil(after) - STEP;
  if (before >= after) return before;
  const middle = before + (after - before) / 2;
  return middle > before && middle < after ? middle : before;
}
