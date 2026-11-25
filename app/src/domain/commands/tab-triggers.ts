// Tab templates applied and released by their triggers (OUT-88, v0.3 brief §6).
// A tag applied with tags.set, or a category an engagement newly carries in an
// import, applies the tab templates it triggers. When the trigger goes, an
// empty tab is removed; a tab with content is kept and marked orphaned, for
// the office to Keep or Remove. Applying the trigger again restores it.
import { defineCommand, type Tx } from "@trellis/framework";
import { valuesOf } from "../cards";
import { applyTab, tabId, type TabVia } from "./cards";
import { requireNow, requireText, writeLog } from "./shared";

export type TriggerKind = "tag" | "category";

interface EventRef {
  id: string;
  start?: string;
  principal?: string;
}

const templatesFor = (tx: Tx, kind: TriggerKind, ids: ReadonlySet<string>) =>
  tx.list("tabTemplates").filter((t) => t.triggerKind === kind && ids.has(t.trigger ?? ""));

const logTab = (tx: Tx, now: string, event: EventRef, kind: string, note: string) =>
  writeLog(tx, now, { area: "overlay", kind, principal: event.principal ?? "", event: event.id, note });

/** Applies the tab templates these tags or categories trigger. A kept orphaned tab is restored rather than a second one added. */
export function applyTriggeredTabs(tx: Tx, now: string, event: EventRef, kind: TriggerKind, ids: readonly string[], via: TabVia): void {
  if (ids.length === 0) return;
  for (const template of templatesFor(tx, kind, new Set(ids))) {
    const current = tx.get("tabs", tabId(tx, event.id, template.id));
    if (current && !current._deleted) {
      if ((current.orphaned ?? "") !== "") {
        tx.put("tabs", current.id, { orphaned: "" });
        logTab(tx, now, event, "tab-restored", template.name ?? "");
      }
      continue;
    }
    applyTab(tx, now, event, template, via);
    logTab(tx, now, event, "tab-applied", template.name ?? "");
  }
}

const hasContent = (tx: Tx, tab: string): boolean =>
  tx.list("cards").some((c) => c.tab === tab && Object.values(valuesOf(c.values)).some((v) => v.trim() !== ""));

/** Removes or orphans the tabs these tags or categories applied. Tabs added by hand stay as they are. */
export function releaseTriggeredTabs(tx: Tx, now: string, event: EventRef, kind: TriggerKind, ids: readonly string[]): void {
  if (ids.length === 0) return;
  const vias = kind === "tag" ? ["tag", "series"] : ["category"];
  for (const template of templatesFor(tx, kind, new Set(ids))) {
    const tab = tx.get("tabs", tabId(tx, event.id, template.id));
    if (!tab || tab._deleted || !vias.includes(tab.via ?? "") || (tab.orphaned ?? "") !== "") continue;
    if (hasContent(tx, tab.id)) {
      tx.put("tabs", tab.id, { orphaned: now });
      logTab(tx, now, event, "tab-orphaned", template.name ?? "");
    } else {
      for (const card of tx.list("cards").filter((c) => c.tab === tab.id)) tx.remove("cards", card.id);
      tx.remove("tabs", tab.id);
      logTab(tx, now, event, "tab-removed", template.name ?? "");
    }
  }
}

/** Settles an orphaned tab by keeping it: it becomes a tab added by hand, which no trigger removes. */
export const tabKeep = defineCommand("tab.keep", (tx: Tx, input: { now: string; id: string }) => {
  requireNow(tx, input);
  const tab = tx.get("tabs", requireText(tx, input.id, "The tab"));
  if (!tab || tab._deleted) tx.fail("That tab has been removed.");
  tx.put("tabs", tab.id, { orphaned: "", via: "hand" });
});
