// Where a task lands when moved one place up or down in its group, as the
// neighbours task.move takes.

export interface Neighbours {
  previous?: string;
  next?: string;
}

/** The neighbours after moving ids[index] one place; undefined when it can't move that way. */
export function neighboursAfterMove(ids: readonly string[], index: number, direction: "up" | "down"): Neighbours | undefined {
  if (direction === "up") {
    if (index <= 0 || index >= ids.length) return undefined;
    return { previous: ids[index - 2], next: ids[index - 1] };
  }
  if (index < 0 || index >= ids.length - 1) return undefined;
  return { previous: ids[index + 1], next: ids[index + 2] };
}
