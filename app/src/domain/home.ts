// Home's per-user scopes (OUT-58): one per principal and "me" for the user's
// own tasks, each with when the user last marked it seen. The rules and the
// updates themselves are in rules.ts and updates.ts (OUT-86). Pure: no hooks.

/** The scope of the user's own tasks, beside one scope per principal. */
export const ME = "me";

/** How far back Home looks for a scope the user has never marked as seen. */
export const FIRST_LOOK_DAYS = 7;

export const seenId = (user: string, scope: string): readonly [string, string, string] => ["seen", user, scope];
