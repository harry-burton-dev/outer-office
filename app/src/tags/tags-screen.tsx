// Tags: the office's labels and their colours, shared by tasks and events,
// then the Outlook categories the diary has used (OUT-83). The two are
// separate lists: a category never tags a meeting. Right-click a meeting or a
// task to tag it.
import { useState, type FormEvent } from "react";
import { useCommand, useRecords } from "@trellis/framework";
import { Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useApp } from "@/app/app-state";
import { EmptyState, PageHeader } from "@/app/ui";
import { commands } from "@/domain/commands";
import { sortedTags, TAG_COLOURS, type Tag } from "@/domain/tags";
import { TagDot } from "./tag-dot";

const DESCRIPTION = "Tags are the office's own labels. They colour the diary and the task lists.";
const CATEGORIES_DESCRIPTION = "Found in Outlook by each import. Set their colours here; their names come from Outlook.";

type Coloured = { id: string; name?: string; colour?: string };

function useRun() {
  const { now } = useApp();
  const save = useCommand(commands.tagSave);
  const remove = useCommand(commands.tagRemove);
  const [error, setError] = useState("");
  const check = (result: { ok: boolean; error?: string }) => setError(result.ok ? "" : result.error ?? "");
  return {
    error,
    add: (name: string) => { const r = save({ now, name }); check(r); return r.ok; },
    rename: (id: string, name: string) => check(save({ now, id, name })),
    recolour: (id: string, colour: string) => check(save({ now, id, colour })),
    remove: (id: string) => check(remove({ now, id })),
  };
}

function ColourPicker({ tag, onPick, disabled }: { tag: Coloured; onPick(colour: string): void; disabled: boolean }) {
  const current = TAG_COLOURS.find((c) => c.value === tag.colour)?.name ?? "No colour";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={<Button variant="ghost" size="icon" aria-label={`Colour of ${tag.name}: ${current}`} />}
      >
        <TagDot colour={tag.colour} className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto">
        {TAG_COLOURS.map((c) => (
          <DropdownMenuItem key={c.value} onClick={() => onPick(c.value)}>
            <TagDot colour={c.value} className="size-3.5" />
            <span className={cn(c.value === tag.colour && "font-medium")}>{c.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TagRow({ tag, run, readOnly }: { tag: Tag; run: ReturnType<typeof useRun>; readOnly: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? tag.name ?? "";
  const commit = () => {
    if (draft !== null && draft.trim() !== "" && draft !== tag.name) run.rename(tag.id, draft);
    setDraft(null);
  };
  return (
    <li className="flex items-center gap-2">
      <ColourPicker tag={tag} disabled={readOnly} onPick={(colour) => run.recolour(tag.id, colour)} />
      {readOnly ? (
        <span className="flex-1">{tag.name}</span>
      ) : (
        <Input aria-label="Tag name" className="flex-1" value={name} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      )}
      {!readOnly && (
        <Button variant="ghost" size="icon" aria-label={`Remove ${tag.name}`} onClick={() => run.remove(tag.id)}>
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

function AddTag({ run }: { run: ReturnType<typeof useRun> }) {
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() !== "" && run.add(name)) setName("");
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input aria-label="New tag" placeholder="New tag, e.g. Board" value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit">Add tag</Button>
    </form>
  );
}

function OutlookCategories({ readOnly }: { readOnly: boolean }) {
  const { now } = useApp();
  const save = useCommand(commands.categorySave);
  const categories = useRecords("categories")
    .filter((c) => !c._deleted && (c.name ?? "") !== "")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name ?? "").localeCompare(b.name ?? ""));
  return (
    <section aria-labelledby="outlook-categories" className="flex flex-col gap-2">
      <h2 id="outlook-categories" className="text-base font-medium">Outlook categories</h2>
      <p className="text-sm text-muted-foreground">{CATEGORIES_DESCRIPTION}</p>
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet. They appear after an import that uses one.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <ColourPicker tag={c} disabled={readOnly} onPick={(colour) => save({ now, id: c.id, colour })} />
              <span className="flex-1">{c.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TagsScreen() {
  const { isViewer } = useApp();
  const tags = sortedTags(useRecords("tags"));
  const run = useRun();
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <PageHeader title="Tags" description={DESCRIPTION} />
      {!isViewer && <AddTag run={run} />}
      {run.error && <p className="text-sm text-destructive" role="alert">{run.error}</p>}
      {tags.length === 0 ? (
        <EmptyState title="No tags yet" body={isViewer ? undefined : "Add one above."} />
      ) : (
        <ul className="flex flex-col gap-2">
          {tags.map((tag) => <TagRow key={tag.id} tag={tag} run={run} readOnly={isViewer} />)}
        </ul>
      )}
      <OutlookCategories readOnly={isViewer} />
    </div>
  );
}
