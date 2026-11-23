// PLACEHOLDER: replace this file. Contract: keep the export name and its props.
// The frame owns the <Sheet> root and its open state (useApp().panel; closing calls closePanel()).
// This component renders only the body: <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-120"> (480 px)
// containing <SheetHeader><SheetTitle>...</SheetTitle></SheetHeader> and the rest. SheetContent
// brings its own close button. The frame keys this component by record id, so state resets per record.
import { SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function NeedsActionPanel() {
  return (
    <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-120">
      <SheetHeader>
        <SheetTitle>Needs action</SheetTitle>
      </SheetHeader>
    </SheetContent>
  );
}
