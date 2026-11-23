// The engagement panel: an imported event with the office's layer on top.
// Overview shows Outlook's fields read-only and the flag; Prep holds the
// office's prep, notes and follow-ups. The frame owns the Sheet root.
import { useRecord } from "@trellis/framework";
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

function EngagementBody({ event }: EngagementBodyProps) {
  const { timezone } = useApp();
  const overlay = useOverlay(event.id);
  return (
    <>
      <SheetHeader>
        <SheetTitle>{titleOf(event)}</SheetTitle>
        <SheetDescription>{whenText(event, timezone)}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
        {event.gone === true && <p className="font-medium">No longer in Outlook.</p>}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="prep">Prep</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="pt-2">
            <OverviewTab event={event} overlay={overlay} />
          </TabsContent>
          <TabsContent value="prep" className="pt-2">
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
