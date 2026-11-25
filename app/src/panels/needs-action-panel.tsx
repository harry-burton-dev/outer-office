// Needs action: the needs-you lane for the chosen principal (OUT-86). One
// source with Home: useNeedsYou. The frame owns the Sheet root.
import { useRecord } from "@trellis/framework";
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useApp } from "@/app/app-state";
import { useNeedsYou } from "@/app/updates-data";
import { EmptyState } from "@/app/ui";
import { UpdateRow } from "@/screens/home/update-row";

function PrincipalCode() {
  const { principalId } = useApp();
  const principal = useRecord("principals", principalId ?? "");
  const code = principal && !principal._deleted ? principal.code : undefined;
  return code ? <SheetDescription>{code}</SheetDescription> : null;
}

function Lane() {
  const { isViewer } = useApp();
  const { updates } = useNeedsYou();
  if (updates.length === 0) return <EmptyState title="Nothing needs action" />;
  return (
    <ul className="flex flex-col overflow-y-auto px-4 pb-4">
      {updates.map((u) => <UpdateRow key={u.key} update={u} readOnly={isViewer} />)}
    </ul>
  );
}

export function NeedsActionPanel() {
  return (
    <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-120">
      <SheetHeader>
        <SheetTitle>Needs action</SheetTitle>
        <PrincipalCode />
      </SheetHeader>
      <Lane />
    </SheetContent>
  );
}
