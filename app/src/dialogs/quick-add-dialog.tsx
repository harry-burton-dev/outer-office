// PLACEHOLDER: replace this file. Contract: keep the export name and its (prop-less) signature.
// The frame owns the <Dialog> root: open is useApp().quickAddOpen, and closing (Escape, the close
// button, a click outside) calls closeQuickAdd(). The frame renders this component always, inside
// that root; it renders only <DialogContent> with <DialogHeader><DialogTitle>...</DialogTitle></DialogHeader>
// and the rest. Read quickAddOpen from useApp() to reset its own state; call closeQuickAdd() after
// adding. It has the dialog's one primary button.
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function QuickAddDialog() {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Quick add</DialogTitle>
      </DialogHeader>
    </DialogContent>
  );
}
