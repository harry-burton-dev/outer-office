// PLACEHOLDER: replace this file. Contract: keep the export name and its (prop-less) signature.
// A screen renders inside the frame's content area (24 px padding already applied). It takes
// everything from useApp() and the data hooks, and starts with <PageHeader title=... /> from
// @/app/ui. Lists cap their width at 880 px (max-w-220); the calendar and tables use the full width.
import { PageHeader } from "@/app/ui";

export function LogScreen() {
  return <PageHeader title="Log" />;
}
