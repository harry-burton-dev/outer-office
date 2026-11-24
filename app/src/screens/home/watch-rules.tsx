// The user's rules: one switch per built-in rule, grouped, saved as they
// change. The Alerts screen (OUT-86) adds amounts, surfaces and own rules.
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { commands } from "@/domain/commands";
import { RULES, type RuleGroup, type RuleSetting } from "@/domain/rules";
import { ErrorLine } from "@/screens/tasks/list-parts";
import { useRun } from "@/screens/tasks/use-run";

const GROUPS: readonly RuleGroup[] = [...new Set(RULES.map((r) => r.group))];

export function RuleSwitches({ settings }: { settings: ReadonlyMap<string, RuleSetting> }) {
  const save = useRun(commands.ruleSettingSet);
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Rules</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rules</DialogTitle>
          <DialogDescription>What Home and Needs action show you. Your own changes never show.</DialogDescription>
        </DialogHeader>
        <ErrorLine error={save.error} />
        {GROUPS.map((group) => (
          <fieldset key={group} className="flex flex-col gap-2">
            <legend className="pb-1 text-sm font-medium">{group}</legend>
            {RULES.filter((r) => r.group === group).map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-4">
                <Label htmlFor={`rule-${rule.id}`} className="font-normal">
                  {rule.label}
                  {rule.lane === "needs" && <span className="text-xs text-muted-foreground"> · needs you</span>}
                </Label>
                <Switch id={`rule-${rule.id}`} checked={settings.get(rule.id)?.on === true} onCheckedChange={(on) => save.run({ rule: rule.id, on })} />
              </div>
            ))}
          </fieldset>
        ))}
      </DialogContent>
    </Dialog>
  );
}
