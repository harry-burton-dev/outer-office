// A tag's colour as a small dot.
import { cn } from "cn";

export function TagDot({ colour, className }: { colour: string | undefined; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2.5 shrink-0 rounded-full ring-1 ring-foreground/15", className)} style={{ backgroundColor: colour }} />;
}
