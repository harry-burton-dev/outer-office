// The user's watch rules: one switch per rule, grouped, saved as they change.
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { commands } from "@/domain/commands";
import { rulesOn, WATCH_RULES, type RuleGroup } from "@/domain/home";
import { ErrorLine } from "@/screens/tasks/list-parts";
import { useRun } from "@/screens/tasks/use-run";

const GROUPS: readonly RuleGroup[] = [...new Set(WATCH_RULES.map((r) => r.group))];

export function WatchRules({ watchOff }: { watchOff: string | undefined }) {
  const save = useRun(commands.homeSetWatch);
  const on = useMemo(() => rulesOn(watchOff), [watchOff]);
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(on);
    if (checked) next.add(id);
    else next.delete(id);
    save.run({ on: [...next] });
  };
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Watch rules</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Watch rules</DialogTitle>
          <DialogDescription>What Home shows you. Your own changes never show.</DialogDescription>
        </DialogHeader>
        <ErrorLine error={save.error} />
        {GROUPS.map((group) => (
          <fieldset key={group} className="flex flex-col gap-2">
            <legend className="pb-1 text-sm font-medium">{group}</legend>
            {WATCH_RULES.filter((r) => r.group === group).map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-4">
                <Label htmlFor={`watch-${rule.id}`} className="font-normal">{rule.label}</Label>
                <Switch id={`watch-${rule.id}`} checked={on.has(rule.id)} onCheckedChange={(checked) => toggle(rule.id, checked)} />
              </div>
            ))}
          </fieldset>
        ))}
      </DialogContent>
    </Dialog>
  );
}
