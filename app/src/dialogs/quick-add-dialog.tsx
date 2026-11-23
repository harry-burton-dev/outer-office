// Quick add: one line of text, a preview of what was understood, and Enter to
// add. The frame owns the Dialog root (open is useApp().quickAddOpen).
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRecords } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useApp } from "@/app/app-state";
import { useSharedProject } from "@/app/frame-data";
import { commands } from "@/domain/commands";
import { parseQuickAdd } from "@/domain/quick-add";
import { useInbox, useKnownUsers } from "@/screens/tasks/people";
import { ErrorLine } from "@/screens/tasks/list-parts";
import { useRun } from "@/screens/tasks/use-run";
import { QuickAddPreview } from "./quick-add/preview";
import { resolveQuickAdd, type Resolved } from "./quick-add/resolve";

export const QUICK_ADD_HINT = "#project /section p1 +person ^PRINCIPAL, a date, {deadline}";

function useResolved(text: string): Resolved {
  const { today, userId } = useApp();
  const shared = useSharedProject();
  const inbox = useInbox(userId);
  const sections = useRecords("sections");
  const principals = useRecords("principals");
  const users = useKnownUsers(userId);
  return useMemo(
    () => resolveQuickAdd(parseQuickAdd(text, { today }), { shared, inbox, sections, principals, users }),
    [text, today, shared, inbox, sections, principals, users],
  );
}

export function QuickAddDialog() {
  const { quickAddOpen, closeQuickAdd } = useApp();
  const [text, setText] = useState("");
  const add = useRun(commands.taskAdd);
  const clearError = add.clearError;
  const resolved = useResolved(text);
  useEffect(() => {
    if (!quickAddOpen) {
      setText("");
      clearError();
    }
  }, [quickAddOpen, clearError]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (resolved.input.title.trim() === "") return;
    if (!add.run(resolved.input)) return;
    setText("");
    closeQuickAdd();
  };
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Quick add</DialogTitle>
        <DialogDescription>{QUICK_ADD_HINT}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Input autoFocus aria-label="Task" placeholder="Call back p2 tomorrow" value={text} onChange={(e) => setText(e.target.value)} />
        <QuickAddPreview title={resolved.input.title} chips={resolved.chips} />
        <ErrorLine error={add.error} />
        <DialogFooter>
          <Button type="submit">Add task</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
