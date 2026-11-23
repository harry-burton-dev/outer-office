// The engagement panel: an imported event with the office's layer on top.
// Overview shows Outlook's fields read-only and the flag; each card on the
// meeting has its own tab; Notes holds the office's notes, outcome and
// follow-ups. Cards replace prep. The frame owns the Sheet root.
import { useState } from "react";
import { useCommand, useRecord, useRecords } from "@trellis/framework";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CardForm } from "@/cards/card-form";
import { ShapeIcon } from "@/cards/shape-icon";
import { cardsOn, sortedTemplates } from "@/domain/cards";
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
  const templates = sortedTemplates(useRecords("templates"));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label="Add a card" />}><Plus />Card</DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {templates.length === 0 && <DropdownMenuItem onClick={() => go("templates")}>Make a template…</DropdownMenuItem>}
        {templates.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => { const r = add({ now, event, template: t.id }); if (r.ok) onAdded(r.value); }}>
            <ShapeIcon shape={t.shape} />{t.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EngagementBody({ event }: EngagementBodyProps) {
  const { timezone, isViewer } = useApp();
  const overlay = useOverlay(event.id);
  const cards = cardsOn(useRecords("cards"), event.id);
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
