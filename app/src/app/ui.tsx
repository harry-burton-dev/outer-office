// Small shared pieces so every screen looks the same: a page header, an empty
// state, a labelled field, and dates and times in the office zone.
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { formatDay, formatTime } from "@/domain/dates";
import { useApp } from "./app-state";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** The screen's one h1, with optional actions on the right. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 pb-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-heading text-2xl font-normal tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-12 text-center">
      <h2 className="text-base font-medium">{title}</h2>
      {body && <p className="text-sm text-muted-foreground">{body}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export interface FieldProps {
  label: string;
  /** The control's id. Without it the label wraps the control instead. */
  htmlFor?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, children }: FieldProps) {
  if (htmlFor) {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {children}
      </div>
    );
  }
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export interface DateTextProps {
  /** A date (YYYY-MM-DD) or an ISO UTC instant. */
  value: string;
}

/** "Tue 24 Nov". A date is shown as it is; an instant is shown in the office zone. */
export function DateText({ value }: DateTextProps) {
  const { timezone } = useApp();
  const text = DATE_ONLY.test(value) ? formatDay(`${value}T12:00:00Z`, "UTC") : formatDay(value, timezone);
  return <time dateTime={value}>{text}</time>;
}

export interface TimeTextProps {
  /** An ISO UTC instant. */
  value: string;
}

/** "14:00" in the office zone. */
export function TimeText({ value }: TimeTextProps) {
  const { timezone } = useApp();
  return <time dateTime={value}>{formatTime(value, timezone)}</time>;
}
