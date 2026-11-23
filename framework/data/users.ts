// The framework's own users table (decision D17), read-only through the data
// runtime: the host syncs it beside the app's tables, and the admin page writes it.
import { openTable } from "../engine/src/records/index.js";
import { USERS_SCHEMA, USERS_TABLE } from "../runtime/identity/admin.js";
import type { EngineLike, Identity, RecordTable } from "./registry.ts";
import { createView, type TableView } from "./view.ts";

const open = openTable as (options: { doc: unknown; schema: { version: number }; deviceId: string; user: string; clock: { now(): number } }) => RecordTable;

/** A view of the users table, or null when this engine does not sync one (as in tests of app tables alone). */
export function openUsersView(engine: EngineLike, who: Identity): TableView | null {
  let doc: unknown;
  try {
    doc = engine.table(USERS_TABLE);
  } catch {
    // An engine throws "unknown table" for a table it was not started with; that is the expected case here.
    return null;
  }
  return createView(open({ doc, schema: USERS_SCHEMA, deviceId: who.deviceId, user: who.user, clock: who.clock }));
}
