// The always-visible sync status (ADR-0004 section 5): a label and one plain
// sentence per health state, and a small menu whose one item opens the
// diagnostics view. Compact shows only the badge; the rest moves into the menu.
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Badge } from "./ui/badge";
import type { Health, HealthState } from "../host/engine-types";
import { clockTime } from "./format";
import { useHealth, useShell } from "./context";

const PROBLEM_STATES: ReadonlySet<HealthState> = new Set(["retrying", "folder-disconnected", "not-reaching-peers", "offline"]);

export interface HealthIndicatorProps {
  /** Only the badge; the sentence, times and colleagues are in its menu. Default false. */
  compact?: boolean;
}

interface StatusLinesProps {
  health: Health | null;
  /** Shown first when given (the compact menu). */
  sentence?: string;
}

function StatusLines({ health, sentence }: StatusLinesProps) {
  const { strings } = useShell();
  const peers = Object.entries(health?.peers ?? {});
  return (
    <>
      {sentence && <span>{sentence}</span>}
      {health && health.pending > 0 && <span>{strings.waiting(health.pending)}</span>}
      {health && <span>{strings.lastSave(clockTime(health.lastSaveAt, strings.never))}</span>}
      {health && <span>{strings.lastFolderRead(clockTime(health.lastScanOkAt, strings.never))}</span>}
      {peers.map(([device, peer]) => (
        <span key={device}>{strings.peerHeard(peer.user, clockTime(peer.lastHeardAt, strings.never))}</span>
      ))}
    </>
  );
}

interface HealthMenuProps {
  id: string;
  itemRef: RefObject<HTMLButtonElement | null>;
  onClose(): void;
  onDiagnostics(): void;
  /** The status lines to show above the item (compact only). */
  status?: StatusLinesProps;
}

function HealthMenu({ id, itemRef, onClose, onDiagnostics, status }: HealthMenuProps) {
  const { engine, strings } = useShell();
  return (
    <div
      id={id}
      role="menu"
      aria-label={strings.healthMenu}
      className={`absolute top-full ${status ? "right-0" : "left-0"} z-50 mt-1 flex min-w-40 flex-col rounded-lg border bg-popover p-1 text-popover-foreground shadow-md`}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      {status && (
        <div className="flex flex-col gap-1 px-2 py-1 text-sm text-muted-foreground">
          <StatusLines {...status} />
        </div>
      )}
      <button
        ref={itemRef}
        type="button"
        role="menuitem"
        disabled={!engine}
        className="w-full rounded-md px-2 py-1 text-left outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-50"
        onClick={onDiagnostics}
      >
        {strings.diagnostics}
      </button>
    </div>
  );
}

function useMenu(rootRef: RefObject<HTMLDivElement | null>, itemRef: RefObject<HTMLButtonElement | null>) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    itemRef.current?.focus();
    const outside = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, rootRef, itemRef]);
  return [open, setOpen] as const;
}

export function HealthIndicator({ compact = false }: HealthIndicatorProps = {}) {
  const { strings, openDiagnostics } = useShell();
  const health = useHealth();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useMenu(rootRef, itemRef);
  const menuId = useId();
  const sentenceId = useId();
  const badgeId = useId();

  const closeMenu = (): void => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const wording = health ? strings.health[health.state] : null;
  const named = compact && wording ? { "aria-labelledby": `${badgeId} ${sentenceId}` } : { "aria-describedby": wording ? sentenceId : undefined };

  return (
    <div id="connection" ref={rootRef} className="relative flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        {...named}
        className="rounded-4xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => setOpen(!open)}
      >
        <Badge id={badgeId} variant={health && PROBLEM_STATES.has(health.state) ? "destructive" : "secondary"}>{wording?.label ?? strings.starting}</Badge>
      </button>
      {wording && <span id={sentenceId} hidden={compact}>{wording.sentence}</span>}
      {!compact && <StatusLines health={health} />}
      {open && (
        <HealthMenu
          id={menuId}
          itemRef={itemRef}
          onClose={closeMenu}
          onDiagnostics={() => {
            setOpen(false);
            openDiagnostics();
          }}
          status={compact ? { health, sentence: wording?.sentence } : undefined}
        />
      )}
    </div>
  );
}
