// The engagement a task is linked to: its subject and day, "Not synced yet"
// while the event has not arrived, or "None".
import { useRecord, type RowOf } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { DateText } from "@/app/ui";
import { commands } from "@/domain/commands";
import { ErrorLine } from "@/screens/tasks/list-parts";
import { useRun } from "@/screens/tasks/use-run";

type Task = RowOf<"tasks">;

export interface LinkedEngagementProps {
  task: Task;
  isViewer: boolean;
}

function EventText({ eventId }: { eventId: string }) {
  const event = useRecord("events", eventId);
  if (!event || event._deleted) return <span className="text-muted-foreground">Not synced yet</span>;
  return (
    <span>
      {event.subject || "Untitled engagement"}
      {event.start && <span className="text-muted-foreground">, <DateText value={event.start} /></span>}
    </span>
  );
}

export function LinkedEngagement({ task, isViewer }: LinkedEngagementProps) {
  const link = useRun(commands.taskLink);
  const eventId = task.event ?? "";
  return (
    <section aria-label="Engagement" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Engagement</h3>
      <div className="flex items-center justify-between gap-2 text-sm">
        {eventId === "" ? <span className="text-muted-foreground">None</span> : <EventText eventId={eventId} />}
        {eventId !== "" && !isViewer && (
          <Button variant="ghost" size="sm" onClick={() => link.run({ id: task.id, event: "" })}>Unlink</Button>
        )}
      </div>
      <ErrorLine error={link.error} />
    </section>
  );
}
