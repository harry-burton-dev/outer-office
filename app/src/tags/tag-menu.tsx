// The right-click menu on an event or a task: tick tags on and off, and open it.
// Outlook categories are not tags and don't show here (OUT-83). With two or
// more tags on, "Primary colour" picks the one that colours it.
import type { ReactElement, ReactNode } from "react";
import { useCommand, useRecords } from "@trellis/framework";
import { ContextMenu, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useApp } from "@/app/app-state";
import { commands } from "@/domain/commands";
import { eventTags, makePrimary, sortedTags, tagIdsOf, taskTags } from "@/domain/tags";
import { TagDot } from "./tag-dot";

export interface TagMenuProps {
  target: "event" | "task";
  id: string;
  /** The stored own tags (comma-separated ids). */
  own: string | undefined;
  onOpen(): void;
  /** More menu items, shown after Open. */
  actions?: ReactNode;
  /** One DOM element (not a component); it becomes the right-click target. */
  children: ReactElement;
}

export function TagMenu({ target, id, own, onOpen, actions, children }: TagMenuProps) {
  const { now, isViewer, go } = useApp();
  const allTags = useRecords("tags");
  const tags = sortedTags(allTags);
  const carried = target === "event" ? eventTags(own, allTags) : taskTags(own, allTags);
  const run = useCommand(commands.tagsSet);
  const ownIds = tagIdsOf(own);
  const toggle = (tagId: string, on: boolean) =>
    run({ now, target, id, tags: on ? [...ownIds, tagId] : ownIds.filter((t) => t !== tagId) });
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpen}>Open</ContextMenuItem>
        {actions}
        {!isViewer && (
          <>
            <ContextMenuSeparator />
            <ContextMenuLabel>Tags</ContextMenuLabel>
            {tags.length === 0 && <ContextMenuItem onClick={() => go("tags")}>Add tags…</ContextMenuItem>}
            {tags.map((tag) => (
              <ContextMenuCheckboxItem key={tag.id} checked={ownIds.includes(tag.id)} onCheckedChange={(on) => toggle(tag.id, on)}>
                <TagDot colour={tag.colour} />
                <span>{tag.name}</span>
              </ContextMenuCheckboxItem>
            ))}
            {carried.length > 1 && (
              <>
                <ContextMenuSeparator />
                <ContextMenuLabel>Primary colour</ContextMenuLabel>
                <ContextMenuRadioGroup value={carried[0]?.id} onValueChange={(tagId: string) => run({ now, target, id, tags: makePrimary(own, tagId) })}>
                  {carried.map((tag) => (
                    <ContextMenuRadioItem key={tag.id} value={tag.id} closeOnClick>
                      <TagDot colour={tag.colour} />
                      <span>{tag.name}</span>
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
