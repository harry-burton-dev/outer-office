// A native select styled like the theme's input: keyboard and screen-reader
// friendly as it comes, and simple to drive in tests.
import type { ComponentProps } from "react";
import { cn } from "cn";

export interface SelectOption {
  value: string;
  label: string;
}

export interface NativeSelectProps extends Omit<ComponentProps<"select">, "children"> {
  options: readonly SelectOption[];
}

export function NativeSelect({ options, className, ...props }: NativeSelectProps) {
  return (
    <select
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
        className,
      )}
      {...props}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
