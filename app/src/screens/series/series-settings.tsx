// A series' office data (OUT-87, D8): its tags, priority and Quiet, set with
// seriesOverlay.set. They apply to occurrences that haven't started; the flag
// stays per engagement. Viewers see the values only.
import { useState } from "react";
import { useCommand, useRecords } from "@trellis/framework";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/app/app-state";
import { commands, type SeriesOverlaySetInput } from "@/domain/commands";
import type { Series } from "@/domain/series";
import { sortedTags, tagIdsOf } from "@/domain/tags";
import { NativeSelect } from "@/panels/task/native-select";
import { PRIORITY_OPTIONS } from "@/panels/task/field-options";
import { TagDot } from "@/tags/tag-dot";

const PRIORITY_LABELS = PRIORITY_OPTIONS.map((o) => (o.value === "4" ? { ...o, label: "P4 (none)" } : o));

type SeriesFields = Omit<SeriesOverlaySetInput, "now" | "principal" | "seriesId">;

export function SeriesSettings({ series }: { series: Series }) {
  const { now, isViewer } = useApp();
  const record = useRecords("series").find((r) => !r._deleted && r.principal === series.principal && r.seriesId === series.key);
  const office = useRecords("seriesOverlays").find((o) => !o._deleted && record !== undefined && o.series === record.id);
  const tags = sortedTags(useRecords("tags"));
  const run = useCommand(commands.seriesOverlaySet);
  const [error, setError] = useState("");
  if (!record) return null;
  const own = tagIdsOf(office?.tags);
  const quiet = office?.quiet === true;
  const priority = office?.priority ?? 4;
  const save = (fields: SeriesFields) => {
    const result = run({ now, principal: series.principal, seriesId: series.key, ...fields });
    setError(result.ok ? "" : result.error);
  };
  if (isViewer) {
    const names = tags.filter((t) => own.includes(t.id)).map((t) => t.name);
    return (
      <p className="pl-8 text-sm text-muted-foreground">
        {[`Priority P${priority}`, quiet ? "Quiet" : "", names.length > 0 ? `Tags: ${names.join(", ")}` : ""].filter(Boolean).join(" · ")}
      </p>
    );
  }
  const id = (part: string) => `series-${part}-${record.id}`;
  return (
    <section aria-label={`Office settings for ${series.subject || "this series"}`} className="ml-8 flex flex-col gap-3 rounded-md bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">These apply to occurrences that haven't started. Past ones keep their own.</p>
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Label htmlFor={id("priority")}>Priority</Label>
          <NativeSelect id={id("priority")} className="w-28" options={PRIORITY_LABELS} value={String(priority)} onChange={(e) => save({ priority: Number(e.target.value) })} />
        </div>
        <div className="flex items-center gap-2">
          <Switch id={id("quiet")} aria-label="Quiet" checked={quiet} onCheckedChange={(checked: boolean) => save({ quiet: checked })} />
          <Label htmlFor={id("quiet")}>Quiet: never clashes</Label>
        </div>
      </div>
      {tags.length > 0 && (
        <fieldset className="flex flex-wrap gap-4">
          <legend className="pb-1 text-sm">Tags</legend>
          {tags.map((tag) => (
            <label key={tag.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={own.includes(tag.id)}
                onCheckedChange={(on: boolean) => save({ tags: on ? [...own, tag.id] : own.filter((t) => t !== tag.id) })}
              />
              <TagDot colour={tag.colour} />
              {tag.name}
            </label>
          ))}
        </fieldset>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
