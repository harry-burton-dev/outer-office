// The shell's pieces (spec S4). The framework's public entry re-exports what an app may use.
export { ShellProvider } from "./provider";
export { useHealth, useSession, type TrellisSession } from "./context";
export { TrellisApp, type TrellisAppProps } from "./app-shell";
export { mount } from "./mount";
export { HealthIndicator } from "./health-indicator";
export { ConflictPrompt } from "./conflict-prompt";
export { defaultStrings, type ShellStrings, type ShellStringOverrides, type HealthWording } from "./strings";
export { Button, buttonVariants } from "./ui/button";
export { Badge, badgeVariants } from "./ui/badge";
