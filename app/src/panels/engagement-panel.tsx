// The engagement panel: an imported event with the office's layer on top.
// Overview shows Outlook's fields read-only and the flag; each tab put on the
// meeting from a tab template shows its cards, and each card added on its own
// has its own tab (OUT-88); Notes holds the office's notes, outcome and
// follow-ups. Cards replace prep. The frame owns the Sheet root.
import { useState } from "react";
import { useCommand, useRecord, useRecords } from "@trellis/framework";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CardForm } from "@/cards/card-form";
import { ShapeIcon } from "@/cards/shape-icon";
import { cardsOn, sortedTabTemplates, sortedTemplates, tabIsBehind, tabsOn, type Card, type Tab, type TabTemplate, type Template } from "@/domain/cards";
import { commands } from "@/domain/commands";
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/app/app-state";
import type { Event } from "@/domain/selectors";
import { titleOf } from "@/screens/calendar/calendar-data";
import { OverviewTab } from "./engagement/overview-tab";
import { PrepTab } from "./engagement/prep-tab";
import { useOverlay } from "./engagement/use-overlay";
import { whenText } from "./engagement/when";

export interface EngagementPanelProps {
  eventId: string;
}

const CONTENT_CLASS = "data-[side=right]:w-full data-[side=right]:sm:max-w-120";

interface EngagementBodyProps {
  event: Event;
}

function AddCard({ event, onAdded }: { event: string; onAdded(id: string): void }) {
  const { now, go } = useApp();
  const add = useCommand(commands.cardAdd);
  const apply = useCommand(commands.tabApply);
  const templates = sortedTemplates(useRecords("templates"));
  const tabTemplates = sortedTabTemplates(useRecords("tabTemplates"));
  const onEvent = new Set(tabsOn(useRecords("tabs"), event).map((t) => t.tabTemplate));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label="Add a tab or card" />}><Plus />Add</DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {templates.length === 0 && <DropdownMenuItem onClick={() => go("templates")}>Make a template…</DropdownMenuItem>}
        {tabTemplates.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Tabs</DropdownMenuLabel>
            {tabTemplates.map((t) => (
              <DropdownMenuItem key={t.id} disabled={onEvent.has(t.id)} onClick={() => { const r = apply({ now, event, tabTemplate: t.id }); if (r.ok) onAdded(r.value); }}>
                <ShapeIcon shape={t.shape} />{t.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
        {tabTemplates.length > 0 && templates.length > 0 && <DropdownMenuSeparator />}
        {templates.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Cards</DropdownMenuLabel>
            {templates.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => { const r = add({ now, event, template: t.id }); if (r.ok) onAdded(r.value); }}>
                <ShapeIcon shape={t.shape} />{t.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TabBody({ tab, template, cards, templates }: { tab: Tab; template: TabTemplate | undefined; cards: readonly Card[]; templates: readonly Template[] }) {
  const { now, isViewer } = useApp();
  const remove = useCommand(commands.tabRemove);
  const update = useCommand(commands.tabUpdate);
  const behind = tabIsBehind(tab, template, cards, new Map(templates.filter((t) => !t._deleted).map((t) => [t.id, t])));
  return (
    <div className="flex flex-col gap-6">
      {!isViewer && behind && (
        <div className="flex items-center gap-2 rounded-lg border p-2 text-sm">
          <span className="flex-1">This tab's template has changed since it was added.</span>
          <Button variant="outline" size="sm" onClick={() => update({ now, id: tab.id })}><RefreshCw />Update to the latest</Button>
        </div>
      )}
      {cards.length === 0 && <p className="text-sm text-muted-foreground">This tab has no cards.</p>}
      {cards.map((card) => (
        <CardForm key={card.id} card={card} titled template={templates.find((t) => t.id === card.template && !t._deleted)} />
      ))}
      {!isViewer && <Button variant="ghost" size="sm" className="self-start" onClick={() => remove({ now, id: tab.id })}><Trash2 />Remove tab</Button>}
    </div>
  );
}

function EngagementBody({ event }: EngagementBodyProps) {
  const { timezone, isViewer } = useApp();
  const overlay = useOverlay(event.id);
  const allCards = cardsOn(useRecords("cards"), event.id);
  const tabTemplates = useRecords("tabTemplates");
  const tabs = tabsOn(useRecords("tabs"), event.id, tabTemplates);
  const tabIds = new Set(tabs.map((t) => t.id));
  const cards = allCards.filter((c) => !tabIds.has(c.tab ?? ""));
  const templates = useRecords("templates");
  const [tab, setTab] = useState("overview");
  return (
    <>
      <SheetHeader>
        <SheetTitle>{titleOf(event)}</SheetTitle>
        <SheetDescription>{whenText(event, timezone)}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
        {event.gone === true && <p className="font-medium">No longer in Outlook.</p>}
        <Tabs value={tab} onValueChange={(next: string) => setTab(next)}>
          <div className="flex flex-wrap items-center gap-2">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {tabs.map((t) => {
                const template = tabTemplates.find((x) => x.id === t.tabTemplate && !x._deleted);
                return (
                  <TabsTrigger key={t.id} value={t.id}>
                    <ShapeIcon shape={template?.shape} />{template?.name ?? "Removed tab"}
                  </TabsTrigger>
                );
              })}
              {cards.map((card) => {
                const template = templates.find((t) => t.id === card.template && !t._deleted);
                return (
                  <TabsTrigger key={card.id} value={card.id}>
                    <ShapeIcon shape={template?.shape} />{template?.name ?? "Removed"}
                  </TabsTrigger>
                );
              })}
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>
            {!isViewer && <AddCard event={event.id} onAdded={setTab} />}
          </div>
          <TabsContent value="overview" className="pt-2">
            <OverviewTab event={event} overlay={overlay} />
          </TabsContent>
          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id} className="pt-2">
              <TabBody tab={t} template={tabTemplates.find((x) => x.id === t.tabTemplate && !x._deleted)} cards={allCards.filter((c) => c.tab === t.id)} templates={templates} />
            </TabsContent>
          ))}
          {cards.map((card) => (
            <TabsContent key={card.id} value={card.id} className="pt-2">
              <CardForm card={card} template={templates.find((t) => t.id === card.template && !t._deleted)} />
            </TabsContent>
          ))}
          <TabsContent value="notes" className="pt-2">
            <PrepTab event={event} overlay={overlay} />
          </TabsContent>
        </Tabs>
        {overlay.error && <p className="text-sm text-destructive" role="alert">{overlay.error}</p>}
      </div>
    </>
  );
}

export function EngagementPanel({ eventId }: EngagementPanelProps) {
  const event = useRecord("events", eventId);
  return (
    <SheetContent className={CONTENT_CLASS}>
      {event && !event._deleted ? (
        <EngagementBody event={event} />
      ) : (
        <SheetHeader>
          <SheetTitle>Engagement</SheetTitle>
          <SheetDescription>This engagement has not synced yet.</SheetDescription>
        </SheetHeader>
      )}
    </SheetContent>
  );
}
