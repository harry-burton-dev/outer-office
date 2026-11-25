// Who is watching each principal (OUT-86, the Alerts coverage view): a user
// watches a principal when any needs-you rule of theirs reaches it, or they
// cover someone for it now. Viewers can't act, so they don't count. Pure.
import type { RowOf } from "@trellis/framework";
import { RULES, type RuleSetting } from "./rules";
import { ownParams } from "./updates";

export interface Watcher {
  user: string;
  /** Watching only through cover, for this absent user. */
  coveringFor?: string;
}

export interface CoverageInput {
  principals: readonly { id: string }[];
  /** Active users who can act (not viewers). */
  users: readonly string[];
  settingsOf(user: string): ReadonlyMap<string, RuleSetting>;
  rules: readonly RowOf<"rules">[];
  cover: readonly RowOf<"cover">[];
  now: string;
}

const NEEDS = RULES.filter((r) => r.lane === "needs" && r.scope === "principal");

/** Cover records in force now. */
export const coverInForce = (cover: readonly RowOf<"cover">[], now: string): RowOf<"cover">[] =>
  cover.filter((c) => !c._deleted && (c.start ?? "") <= now && now < (c.end ?? ""));

export function coverage(input: CoverageInput): Map<string, Watcher[]> {
  const out = new Map<string, Watcher[]>(input.principals.map((p) => [p.id, []]));
  const active = coverInForce(input.cover, input.now);
  for (const user of input.users) {
    const settings = input.settingsOf(user);
    const builtIn = NEEDS.some((r) => settings.get(r.id)?.on === true);
    const own = input.rules.filter((r) => !r._deleted && r.owner === user && r.on === true && r.lane === "needs").map((r) => ownParams(r).principal);
    for (const p of input.principals) {
      if (builtIn || own.includes("all") || own.includes(p.id)) { out.get(p.id)?.push({ user }); continue; }
      const covering = active.find((c) => c.cover === user && c.principal === p.id);
      if (covering) out.get(p.id)?.push({ user, coveringFor: covering.absent ?? "" });
    }
  }
  return out;
}
