// The privacy notice, shown once per user before Tasks opens. The frame owns
// the Dialog root and closes it once people.privacyAckAt is set.
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { commands } from "@/domain/commands";
import { ErrorLine } from "@/screens/tasks/list-parts";
import { useRun } from "@/screens/tasks/use-run";

export function PrivacyNotice() {
  const ack = useRun(commands.ackPrivacy);
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Before you use Tasks</DialogTitle>
        <DialogDescription render={<div className="flex flex-col gap-2" />}>
          <p>Your tasks are hidden from colleagues unless you assign them or put them in the shared project.</p>
          <p>They are not secret: everyone in this workspace shares one key.</p>
          <p>Do not put anything here that your colleagues in this office must never see.</p>
        </DialogDescription>
      </DialogHeader>
      <ErrorLine error={ack.error} />
      <DialogFooter>
        <Button onClick={() => ack.run({})}>I understand</Button>
      </DialogFooter>
    </DialogContent>
  );
}
