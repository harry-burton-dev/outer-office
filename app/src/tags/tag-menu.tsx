// The right-click menu on an event or a task: tick tags on and off, and open it.
// Tags an event carries through its Outlook categories show ticked and can't be
// taken off here; change the category in Outlook instead.
import type { ReactElement } from "react";
import { useCommand, useRecords } from "@trellis/framework";
import { ContextMenu, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useApp } from "@/app/app-state";
import { commands } from "@/domain/commands";
import { fromCategory, sortedTags, tagIdsOf } from "@/domain/tags";
import { TagDot } from "./tag-dot";

export interface TagMenuProps {
  target: "event" | "task";
  id: string;
  /** The stored own tags (comma-separated ids). */
  own: string | undefined;
  /** An event's Outlook categories. */
  categories?: string;
  onOpen(): void;
  /** One DOM element (not a component); it becomes the right-click target. */
  children: ReactElement;
}

export function TagMenu({ target, id, own, categories, onOpen, children }: TagMenuProps) {
  const { now, isViewer, go } = useApp();
  const tags = sortedTags(useRecords("tags"));
  const run = useCommand(commands.tagsSet);
  const ownIds = tagIdsOf(own);
  const toggle = (tagId: string, on: boolean) =>
    run({ now, target, id, tags: on ? [...ownIds, tagId] : ownIds.filter((t) => t !== tagId) });
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpen}>Open</ContextMenuItem>
        {!isViewer && (
          <>
            <ContextMenuSeparator />
            <ContextMenuLabel>Tags</ContextMenuLabel>
            {tags.length === 0 && <ContextMenuItem onClick={() => go("tags")}>Add tags…</ContextMenuItem>}
            {tags.map((tag) => {
              const viaCategory = fromCategory(tag, categories);
              return (
                <ContextMenuCheckboxItem
                  key={tag.id}
                  checked={viaCategory || ownIds.includes(tag.id)}
                  disabled={viaCategory}
                  onCheckedChange={(on) => toggle(tag.id, on)}
                >
                  <TagDot colour={tag.colour} />
                  <span>{tag.name}</span>
                  {viaCategory && <span className="text-xs text-muted-foreground">Outlook</span>}
                </ContextMenuCheckboxItem>
              );
            })}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
