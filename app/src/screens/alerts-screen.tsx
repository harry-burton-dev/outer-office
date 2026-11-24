// Alerts (OUT-86, v0.3 brief 8; user menu): the rule library with each built-in
// rule's switch, amount, surfaces and "What this would have shown last week";
// the user's own rules (D4); cover; and who is watching each principal.
import { useMemo, useState } from "react";
import { useRecords } from "@trellis/framework";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/app/app-state";
import { activePeople, usePeople } from "@/app/people";
import { useActivePrincipals } from "@/app/principals";
import { EmptyState, PageHeader } from "@/app/ui";
import { useUpdates } from "@/app/updates-data";
import { NativeSelect } from "@/panels/task/native-select";
import { commands } from "@/domain/commands";
import { coverage, coverInForce } from "@/domain/coverage";
import { addDays, instantIn } from "@/domain/dates";
import { RULES, ruleById, settingsFor, SURFACES, type Lane, type Rule, type Surface } from "@/domain/rules";
import { isViewer } from "@/domain/selectors";
import { ownParams, ownRuleId, previewRule } from "@/domain/updates";
import { valueText } from "@/screens/log/log-model";
import { ErrorLine } from "@/screens/tasks/list-parts";
import { useRun } from "@/screens/tasks/use-run";
import { updateText, useSubjects } from "./home/update-row";

const SURFACE_LABEL: Readonly<Record<Surface, string>> = { home: "Home", needs: "Needs action", badge: "Badge" };
const GROUPS = [...new Set(RULES.map((r) => r.group))];

function Surfaces({ id, value, onChange }: { id: string; value: readonly Surface[]; onChange(next: Surface[]): void }) {
  return (
    <span className="flex flex-wrap gap-3">
      {SURFACES.map((x) => (
        <Label key={x} className="flex items-center gap-1 font-normal">
          <Checkbox
            id={`${id}-${x}`}
            checked={value.includes(x)}
            onCheckedChange={(checked) => onChange(SURFACES.filter((y) => (y === x ? checked === true : value.includes(y))))}
          />
          {SURFACE_LABEL[x]}
        </Label>
      ))}
    </span>
  );
}

function Preview({ rule }: { rule: string }) {
  const { input } = useUpdates();
  const { timezone, today } = useApp();
  const subjects = useSubjects();
  const shown = useMemo(() => previewRule(input, rule), [input, rule]);
  return (
    <details className="text-xs" data-testid={`preview-${rule}`}>
      <summary className="cursor-pointer text-muted-foreground">What this would have shown last week: {shown.length}</summary>
      <ul className="flex flex-col pl-3">
        {shown.map((u) => {
          const t = updateText(u, subjects, timezone, today);
          return <li key={u.key}>{t.what}{t.about && ` · ${t.about}`}{t.detail && ` · ${t.detail}`}</li>;
        })}
      </ul>
    </details>
  );
}

function BuiltInRule({ rule }: { rule: Rule }) {
  const { settings } = useUpdates();
  const save = useRun(commands.ruleSettingSet);
  const setting = settings.get(rule.id);
  const [amount, setAmount] = useState(String(setting?.amount ?? ""));
  return (
    <li data-testid={`rule-${rule.id}`} className="flex flex-col gap-1 border-b py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Switch id={`alert-${rule.id}`} checked={setting?.on === true} onCheckedChange={(on) => save.run({ rule: rule.id, on })} />
        <Label htmlFor={`alert-${rule.id}`} className="min-w-60 flex-1 font-normal">
          {rule.label}
          <span className="text-xs text-muted-foreground"> · {rule.lane === "needs" ? "needs you" : "for information"}</span>
        </Label>
        {rule.amount && (
          <Label className="flex items-center gap-1 font-normal">
            {rule.amount.label}
            <Input
              aria-label={`${rule.label}: ${rule.amount.unit}`}
              type="number" className="w-20" min={rule.amount.min} max={rule.amount.max} value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => { const n = Number(amount); if (n !== setting?.amount) save.run({ rule: rule.id, amount: n }); }}
            />
            {rule.amount.unit}
          </Label>
        )}
        <Surfaces id={`surface-${rule.id}`} value={setting?.surfaces ?? []} onChange={(surfaces) => save.run({ rule: rule.id, surfaces })} />
      </div>
      <ErrorLine error={save.error} />
      <Preview rule={rule.id} />
    </li>
  );
}

function NewRule() {
  const principals = useActivePrincipals();
  const save = useRun(commands.ruleSave);
  const [name, setName] = useState("");
  const [condition, setCondition] = useState(RULES[0].id);
  const [principal, setPrincipal] = useState("all");
  const [amount, setAmount] = useState("");
  const [lane, setLane] = useState<Lane>("info");
  const [surfaces, setSurfaces] = useState<Surface[]>(["home"]);
  const base = ruleById(condition);
  const laneNow: Lane = base?.kind === "state" ? "needs" : lane;
  const submit = () => {
    const ok = save.run({
      name, condition, principal, lane: laneNow, surfaces, on: true,
      ...(base?.amount && amount !== "" ? { amount: Number(amount) } : {}),
    });
    if (ok) { setName(""); setAmount(""); }
  };
  return (
    <form className="flex flex-col gap-2 rounded-lg border p-3" onSubmit={(e) => { e.preventDefault(); submit(); }} aria-label="New rule">
      <div className="grid gap-2 sm:grid-cols-2">
        <Label className="flex flex-col items-start gap-1 font-normal">Name<Input value={name} onChange={(e) => setName(e.target.value)} /></Label>
        <Label className="flex flex-col items-start gap-1 font-normal">
          When
          <NativeSelect value={condition} onChange={(e) => setCondition(e.target.value)} options={RULES.map((r) => ({ value: r.id, label: r.label }))} />
        </Label>
        <Label className="flex flex-col items-start gap-1 font-normal">
          For
          <NativeSelect value={principal} onChange={(e) => setPrincipal(e.target.value)} options={[{ value: "all", label: "All principals" }, ...principals.map((p) => ({ value: p.id, label: p.code ?? p.id }))]} />
        </Label>
        {base?.amount && (
          <Label className="flex flex-col items-start gap-1 font-normal">
            {base.amount.label} ({base.amount.unit})
            <Input type="number" min={base.amount.min} max={base.amount.max} placeholder={String(base.amount.default)} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Label>
        )}
        <Label className="flex flex-col items-start gap-1 font-normal">
          Lane
          <NativeSelect
            value={laneNow} disabled={base?.kind === "state"} onChange={(e) => setLane(e.target.value === "needs" ? "needs" : "info")}
            options={[{ value: "info", label: "For information" }, { value: "needs", label: "Needs you" }]}
          />
        </Label>
      </div>
      <Surfaces id="new-rule" value={surfaces} onChange={setSurfaces} />
      <ErrorLine error={save.error} />
      <div><Button type="submit">Add rule</Button></div>
    </form>
  );
}

function OwnRules() {
  const { userId } = useApp();
  const rules = useRecords("rules").filter((r) => !r._deleted && r.owner === userId);
  const principals = useActivePrincipals();
  const save = useRun(commands.ruleSave);
  const remove = useRun(commands.ruleRemove);
  return (
    <section aria-label="Your rules" className="flex flex-col gap-3">
      <h2 className="text-base font-medium">Your rules</h2>
      <p className="text-sm text-muted-foreground">Rules you make are for you only.</p>
      <ErrorLine error={save.error ?? remove.error} />
      {rules.length > 0 && (
        <ul className="flex flex-col">
          {rules.map((r) => {
            const params = ownParams(r);
            const base = ruleById(r.condition ?? "");
            const where = params.principal === "all" ? "all principals" : (principals.find((p) => p.id === params.principal)?.code ?? params.principal);
            const surfaces = (r.surfaces ?? "").split(",").filter((x): x is Surface => SURFACES.includes(x as Surface));
            return (
              <li key={r.id} data-testid="own-rule" className="flex flex-col gap-1 border-b py-2 last:border-b-0">
                <div className="flex flex-wrap items-center gap-3">
                  <Switch
                    aria-label={`${r.name} on`} checked={r.on === true}
                    onCheckedChange={(on) => save.run({
                      id: r.id, name: r.name ?? "", condition: r.condition ?? "", principal: params.principal,
                      lane: r.lane === "needs" ? "needs" : "info", surfaces, on, ...(params.amount !== undefined ? { amount: params.amount } : {}),
                    })}
                  />
                  <span className="font-medium">{r.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {base?.label ?? r.condition} · {where}{params.amount !== undefined && base?.amount ? ` · ${params.amount} ${base.amount.unit}` : ""} · {r.lane === "needs" ? "needs you" : "for information"}
                  </span>
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => remove.run({ id: r.id })}>Remove</Button>
                </div>
                <Preview rule={ownRuleId(r)} />
              </li>
            );
          })}
        </ul>
      )}
      <NewRule />
    </section>
  );
}

function Cover() {
  const { timezone, today, now, isViewer: viewer } = useApp();
  const principals = useActivePrincipals();
  const people = usePeople();
  const choices = activePeople(people).map((u) => ({ value: u.id, label: u.name }));
  const records = useRecords("cover").filter((c) => !c._deleted && (c.end ?? "") > now);
  const save = useRun(commands.coverSave);
  const remove = useRun(commands.coverRemove);
  const [principal, setPrincipal] = useState(principals[0]?.id ?? "");
  const [absent, setAbsent] = useState(choices[0]?.value ?? "");
  const [cover, setCover] = useState(choices[1]?.value ?? choices[0]?.value ?? "");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const codeOf = (id: string) => principals.find((p) => p.id === id)?.code ?? id;
  const inForce = new Set(coverInForce(records, now).map((c) => c.id));
  return (
    <section aria-label="Cover" className="flex flex-col gap-3">
      <h2 className="text-base font-medium">Cover</h2>
      <p className="text-sm text-muted-foreground">While cover is in force, the person covering also gets the needs-you updates of the person away, for that principal.</p>
      <ErrorLine error={save.error ?? remove.error} />
      {records.length > 0 && (
        <ul className="flex flex-col">
          {records.map((c) => (
            <li key={c.id} data-testid="cover" className="flex flex-wrap items-center gap-3 border-b py-2 text-sm last:border-b-0">
              <span>{people.nameOf(c.cover ?? "")} covers {people.nameOf(c.absent ?? "")} for {codeOf(c.principal ?? "")}</span>
              <span className="text-muted-foreground">{valueText(c.start, timezone)} to {valueText(c.end, timezone)}{inForce.has(c.id) ? " · now" : ""}</span>
              {!viewer && <Button variant="ghost" size="sm" className="ml-auto" onClick={() => remove.run({ id: c.id })}>End</Button>}
            </li>
          ))}
        </ul>
      )}
      {!viewer && principals.length > 0 && (
        <form
          aria-label="New cover" className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ principal, absent, cover, start: instantIn(start, "00:00", timezone), end: instantIn(addDays(end, 1), "00:00", timezone) });
          }}
        >
          <Label className="flex flex-col items-start gap-1 font-normal">Principal<NativeSelect value={principal} onChange={(e) => setPrincipal(e.target.value)} options={principals.map((p) => ({ value: p.id, label: p.code ?? p.id }))} /></Label>
          <Label className="flex flex-col items-start gap-1 font-normal">Away<NativeSelect value={absent} onChange={(e) => setAbsent(e.target.value)} options={choices} /></Label>
          <Label className="flex flex-col items-start gap-1 font-normal">Covering<NativeSelect value={cover} onChange={(e) => setCover(e.target.value)} options={choices} /></Label>
          <Label className="flex flex-col items-start gap-1 font-normal">From<Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Label>
          <Label className="flex flex-col items-start gap-1 font-normal">To<Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Label>
          <div className="flex items-end"><Button type="submit">Set cover</Button></div>
        </form>
      )}
    </section>
  );
}

function Coverage() {
  const { now } = useApp();
  const principals = useActivePrincipals();
  const people = usePeople();
  const peopleRows = useRecords("people");
  const ruleSettings = useRecords("ruleSettings");
  const rules = useRecords("rules");
  const cover = useRecords("cover");
  const watching = useMemo(() => {
    const users = activePeople(people).map((u) => u.id).filter((id) => !isViewer(peopleRows, id));
    const settingsOf = (user: string) => settingsFor(user, ruleSettings, peopleRows.find((p) => !p._deleted && p.userId === user)?.watchOff);
    return coverage({ principals, users, settingsOf, rules, cover, now });
  }, [people, peopleRows, ruleSettings, rules, cover, principals, now]);
  return (
    <section aria-label="Who is watching" className="flex flex-col gap-2">
      <h2 className="text-base font-medium">Who is watching</h2>
      <ul className="flex flex-col">
        {principals.map((p) => {
          const list = watching.get(p.id) ?? [];
          return (
            <li key={p.id} data-testid="coverage" className="border-b py-2 text-sm last:border-b-0">
              <span className="font-medium">{p.code}</span>{" "}
              {list.length === 0 ? (
                <span role="alert" className="font-medium text-destructive">Nobody is watching this principal's diary.</span>
              ) : (
                <span className="text-muted-foreground">
                  {list.map((w) => (w.coveringFor ? `${people.nameOf(w.user)} (covering for ${people.nameOf(w.coveringFor)})` : people.nameOf(w.user))).join(", ")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AlertsScreen() {
  const principals = useActivePrincipals();
  return (
    <div className="flex max-w-220 flex-col gap-8">
      <PageHeader title="Alerts" description="What posts an update for you, and where it shows. Your own changes never show." />
      <section aria-label="Built-in rules" className="flex flex-col gap-4">
        <h2 className="text-base font-medium">Built-in rules</h2>
        {GROUPS.map((group) => (
          <div key={group} className="flex flex-col">
            <h3 className="text-sm font-medium">{group}</h3>
            <ul className="flex flex-col">{RULES.filter((r) => r.group === group).map((r) => <BuiltInRule key={r.id} rule={r} />)}</ul>
          </div>
        ))}
      </section>
      <OwnRules />
      <Cover />
      {principals.length === 0 ? <EmptyState title="No principals yet" body="Add them in the admin page." /> : <Coverage />}
    </div>
  );
}
