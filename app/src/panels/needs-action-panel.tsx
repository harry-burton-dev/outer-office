// Needs action, for the chosen principal: overdue and due-today tasks,
// engagements in the next 24 hours that need prep, and gone engagements with
// office data. Read-only: the rows open panels. The frame owns the Sheet root.
import { useRecord } from "@trellis/framework";
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApp } from "@/app/app-state";
import { needsActionCount, useNeedsAction } from "@/app/frame-data";
import { EmptyState } from "@/app/ui";
import { EventRow, Section, TaskRow } from "./needs-action/rows";

function PrincipalCode() {
  const { principalId } = useApp();
  const principal = useRecord("principals", principalId ?? "");
  const code = principal && !principal._deleted ? principal.code : undefined;
  return code ? <SheetDescription>{code}</SheetDescription> : null;
}

function Lists() {
  const lists = useNeedsAction();
  if (needsActionCount(lists) === 0) return <EmptyState title="Nothing needs action" />;
  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-2 pb-4">
      {lists.overdue.length > 0 && <Section title="Overdue">{lists.overdue.map((t) => <TaskRow key={t.id} task={t} overdue />)}</Section>}
      {lists.dueToday.length > 0 && <Section title="Due today">{lists.dueToday.map((t) => <TaskRow key={t.id} task={t} overdue={false} />)}</Section>}
      {lists.prepNeeded.length > 0 && <Section title="Prep needed">{lists.prepNeeded.map((e) => <EventRow key={e.id} event={e} withDay={false} />)}</Section>}
      {lists.goneWithData.length > 0 && <Section title="Gone from Outlook">{lists.goneWithData.map((e) => <EventRow key={e.id} event={e} withDay />)}</Section>}
    </div>
  );
}

export function NeedsActionPanel() {
  return (
    <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-120">
      <SheetHeader>
        <SheetTitle>Needs action</SheetTitle>
        <PrincipalCode />
      </SheetHeader>
      <Lists />
    </SheetContent>
  );
}
