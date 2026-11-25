// Templates: the office designs its own cards. Each template has a name, a
// shape shown on the meetings that carry it, and a form. A card is complete
// when its required fields are filled (or all of them, when none is required).
// Tab templates group card templates into one tab on a meeting (OUT-88).
import { useState, type FormEvent } from "react";
import { useCommand, useRecords } from "@trellis/framework";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/app/app-state";
import { EmptyState, PageHeader } from "@/app/ui";
import { commands } from "@/domain/commands";
import { FIELD_TYPES, SHAPES, cardTemplatesOf, fieldsOf, sortedTabTemplates, sortedTemplates, type FieldType, type TabTemplate, type Template, type TemplateField } from "@/domain/cards";
import { NativeSelect } from "@/panels/task/native-select";
import { ShapeIcon } from "./shape-icon";

const DESCRIPTION = "Cards you add to meetings, such as a point of contact or a dial-in. Each has a shape that shows on the meeting, and a form. The shape fills in once the required fields are done.";

function useTemplates() {
  const { now } = useApp();
  const save = useCommand(commands.templateSave);
  const remove = useCommand(commands.templateRemove);
  const [error, setError] = useState("");
  const check = (result: { ok: boolean; error?: string }) => (setError(result.ok ? "" : result.error ?? ""), result.ok);
  return {
    error,
    add: (name: string) => check(save({ now, name })),
    save: (id: string, change: { name?: string; shape?: string; fields?: TemplateField[] }) => check(save({ now, id, ...change })),
    remove: (id: string) => check(remove({ now, id })),
  };
}
type Run = ReturnType<typeof useTemplates>;

function ShapePicker({ shape, onPick, disabled }: { shape: string | undefined; onPick(shape: string): void; disabled: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={disabled} render={<Button variant="outline" size="icon" aria-label={`Shape: ${shape ?? "none"}`} />}>
        <ShapeIcon shape={shape} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="grid w-auto grid-cols-4 gap-1">
        {SHAPES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => onPick(s)} aria-label={s} className={cn("justify-center", s === shape && "bg-accent")}>
            <ShapeIcon shape={s} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const newField = (): TemplateField => ({ id: Math.random().toString(36).slice(2, 10), label: "", type: "text", required: false });

function FieldRow({ field, onChange, onMove, onRemove, first, last }: {
  field: TemplateField; onChange(field: TemplateField): void; onMove(by: -1 | 1): void; onRemove(): void; first: boolean; last: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Input aria-label="Field label" placeholder="Label, e.g. Number to call" value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} className="flex-1" />
        <NativeSelect aria-label="Field type" className="w-44" options={FIELD_TYPES} value={field.type} onChange={(e) => onChange({ ...field, type: e.target.value as FieldType })} />
        <label className="flex items-center gap-1.5 text-xs"><Switch size="sm" checked={field.required === true} onCheckedChange={(v) => onChange({ ...field, required: v })} />Required</label>
        <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={first} onClick={() => onMove(-1)}><ArrowUp /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={last} onClick={() => onMove(1)}><ArrowDown /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${field.label || "field"}`} onClick={onRemove}><Trash2 /></Button>
      </div>
      {field.type === "choice" && (
        <Textarea aria-label="Options" rows={3} value={field.options ?? ""} onChange={(e) => onChange({ ...field, options: e.target.value })}
          placeholder={"One per line. Add a detail after a bar:\nTeams bridge | 020 7946 0000\nZoom room | 020 7946 0001"} />
      )}
    </li>
  );
}

function TemplateEditor({ template, run, readOnly }: { template: Template; run: Run; readOnly: boolean }) {
  const saved = fieldsOf(template.fields);
  const [draft, setDraft] = useState<TemplateField[] | null>(null);
  const [name, setName] = useState<string | null>(null);
  const fields = draft ?? saved;
  const dirty = draft !== null;
  const change = (i: number, field: TemplateField) => setDraft(fields.map((f, j) => (j === i ? field : f)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...fields];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setDraft(next);
  };
  const saveName = () => {
    if (name !== null && name.trim() !== "" && name !== template.name) run.save(template.id, { name });
    setName(null);
  };
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4" aria-label={template.name}>
      <div className="flex items-center gap-2">
        <ShapePicker shape={template.shape} disabled={readOnly} onPick={(shape) => run.save(template.id, { shape })} />
        {readOnly ? <h2 className="flex-1 font-medium">{template.name}</h2> : (
          <Input aria-label="Template name" className="flex-1 font-medium" value={name ?? template.name ?? ""} onChange={(e) => setName(e.target.value)} onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        )}
        {!readOnly && <Button variant="ghost" size="icon" aria-label={`Remove ${template.name}`} onClick={() => run.remove(template.id)}><Trash2 /></Button>}
      </div>
      {readOnly ? (
        <ul className="flex flex-col gap-1 text-sm">{saved.map((f) => <li key={f.id}>{f.label}{f.required && " *"}</li>)}</ul>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {fields.map((f, i) => (
              <FieldRow key={f.id} field={f} first={i === 0} last={i === fields.length - 1} onChange={(next) => change(i, next)} onMove={(by) => move(i, by)}
                onRemove={() => setDraft(fields.filter((_, j) => j !== i))} />
            ))}
          </ul>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDraft([...fields, newField()])}><Plus />Add a field</Button>
            {dirty && <Button onClick={() => run.save(template.id, { fields }) && setDraft(null)}>Save the form</Button>}
            {dirty && <Button variant="ghost" onClick={() => setDraft(null)}>Undo changes</Button>}
          </div>
        </>
      )}
    </section>
  );
}

function useTabTemplates() {
  const { now } = useApp();
  const save = useCommand(commands.tabTemplateSave);
  const remove = useCommand(commands.tabTemplateRemove);
  const [error, setError] = useState("");
  const check = (result: { ok: boolean; error?: string }) => (setError(result.ok ? "" : result.error ?? ""), result.ok);
  return {
    error,
    add: (name: string) => check(save({ now, name })),
    save: (id: string, change: { name?: string; shape?: string; cards?: string[] }) => check(save({ now, id, ...change })),
    remove: (id: string) => check(remove({ now, id })),
  };
}
type TabRun = ReturnType<typeof useTabTemplates>;

function TabTemplateEditor({ template, cardTemplates, run, readOnly }: { template: TabTemplate; cardTemplates: readonly Template[]; run: TabRun; readOnly: boolean }) {
  const [name, setName] = useState<string | null>(null);
  const cards = cardTemplatesOf(template.cards);
  const nameOf = (id: string) => cardTemplates.find((t) => t.id === id)?.name ?? "Removed template";
  const shapeOf = (id: string) => cardTemplates.find((t) => t.id === id)?.shape;
  const setCards = (next: string[]) => run.save(template.id, { cards: next });
  const move = (i: number, by: -1 | 1) => {
    const next = [...cards];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setCards(next);
  };
  const saveName = () => {
    if (name !== null && name.trim() !== "" && name !== template.name) run.save(template.id, { name });
    setName(null);
  };
  const addable = cardTemplates.filter((t) => !cards.includes(t.id));
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4" aria-label={template.name}>
      <div className="flex items-center gap-2">
        <ShapePicker shape={template.shape} disabled={readOnly} onPick={(shape) => run.save(template.id, { shape })} />
        {readOnly ? <h3 className="flex-1 font-medium">{template.name}</h3> : (
          <Input aria-label="Tab name" className="flex-1 font-medium" value={name ?? template.name ?? ""} onChange={(e) => setName(e.target.value)} onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        )}
        {!readOnly && <Button variant="ghost" size="icon" aria-label={`Remove ${template.name}`} onClick={() => run.remove(template.id)}><Trash2 /></Button>}
      </div>
      {cards.length === 0 && <p className="text-sm text-muted-foreground">No cards yet.</p>}
      <ul className="flex flex-col gap-1" aria-label={`${template.name} cards`}>
        {cards.map((id, i) => (
          <li key={id} className="flex items-center gap-2 text-sm">
            <ShapeIcon shape={shapeOf(id)} />
            <span className="flex-1">{nameOf(id)}</span>
            {!readOnly && (
              <>
                <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === cards.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Take ${nameOf(id)} off the tab`} onClick={() => setCards(cards.filter((c) => c !== id))}><Trash2 /></Button>
              </>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && addable.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" className="self-start" />}><Plus />Add a card</DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            {addable.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => setCards([...cards, t.id])}><ShapeIcon shape={t.shape} />{t.name}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </section>
  );
}

function AddByName({ label, placeholder, button, onAdd }: { label: string; placeholder: string; button: string; onAdd(name: string): boolean }) {
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() !== "" && onAdd(name)) setName("");
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input aria-label={label} placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit">{button}</Button>
    </form>
  );
}

const TABS_DESCRIPTION = "A tab groups cards for a kind of meeting, such as a board meeting. Add it to a meeting and its cards come with it.";

export function TemplatesScreen() {
  const { isViewer } = useApp();
  const templates = sortedTemplates(useRecords("templates"));
  const tabTemplates = sortedTabTemplates(useRecords("tabTemplates"));
  const run = useTemplates();
  const tabRun = useTabTemplates();
  return (
    <div className="flex max-w-3xl flex-col gap-4 overflow-y-auto pb-6">
      <PageHeader title="Templates" description={DESCRIPTION} />
      {!isViewer && <AddByName label="New template" placeholder="New template, e.g. Dial-in" button="Add template" onAdd={run.add} />}
      {run.error && <p className="text-sm text-destructive" role="alert">{run.error}</p>}
      {templates.length === 0 ? (
        <EmptyState title="No templates yet" body={isViewer ? undefined : "Add one above, then give it fields."} />
      ) : (
        templates.map((t) => <TemplateEditor key={t.id} template={t} run={run} readOnly={isViewer} />)
      )}
      <section aria-label="Tabs" className="mt-4 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Tabs</h2>
          <p className="text-sm text-muted-foreground">{TABS_DESCRIPTION}</p>
        </div>
        {!isViewer && <AddByName label="New tab" placeholder="New tab, e.g. Board meeting" button="Add tab" onAdd={tabRun.add} />}
        {tabRun.error && <p className="text-sm text-destructive" role="alert">{tabRun.error}</p>}
        {tabTemplates.length === 0 ? (
          <EmptyState title="No tabs yet" body={isViewer ? undefined : "Add one above, then give it cards."} />
        ) : (
          tabTemplates.map((t) => <TabTemplateEditor key={t.id} template={t} cardTemplates={templates} run={tabRun} readOnly={isViewer} />)
        )}
      </section>
    </div>
  );
}
