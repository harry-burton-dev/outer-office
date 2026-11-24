import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-(--ag-r-sm) border border-transparent bg-[color-mix(in_oklab,var(--ag-ink)_5%,var(--ag-surface))] px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ag-ink)] disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
