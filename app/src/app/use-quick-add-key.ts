// Q opens quick add, unless focus is somewhere the user types.
import { useEffect } from "react";

const TYPING = "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox']";

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TYPING) !== null;
}

const isQuickAddKey = (event: KeyboardEvent): boolean =>
  event.key.toLowerCase() === "q" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.repeat && !event.defaultPrevented;

export function useQuickAddKey(enabled: boolean, open: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent): void => {
      if (!isQuickAddKey(event) || isTypingTarget(event.target)) return;
      event.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, open]);
}
