# Outer Office: design brief

The look is shadcn/ui on Tailwind, default neutral theme, light and dark. The reference for density is a modern task manager or mail client: calm, mostly text, colour used to mean something.

## Limits that can be checked

1. **One primary button per screen or dialog.** Everything else is outline or ghost.
2. **At most two marks on a calendar event.** Priority order: prep needed, flagged, moved. Anything else lives in the engagement panel.
3. **Four text sizes:** 12, 14, 16 and 20 px. Body is 14.
4. **Two font weights:** regular and medium (500). No bold except inside headings.
5. **Colour carries meaning, never decoration.** Neutral for almost everything; the theme's destructive colour for overdue and errors; one accent, the theme's primary, for the current selection and the primary button.
6. **No more than three badges visible in any list row.**
7. **Detail on demand.** A row shows what is needed to decide whether to open it. Everything else is in the panel.
8. **Spacing from the Tailwind scale only,** in steps of 4 px. Page padding 24, card padding 16, row height at least 36.
9. **No explanatory paragraphs on working screens.** Help text belongs in empty states and dialogs.
10. **Every interactive element is reachable by keyboard** and has a visible focus ring. Every icon-only button has an accessible name.

## Components

Use shadcn components as they come: `sidebar`, `sheet`, `dialog`, `tabs`, `button`, `badge`, `input`, `select`, `checkbox`, `table`, `command`, `dropdown-menu`, `tooltip`, `separator`. Icons from `lucide-react`. Do not restyle a component beyond its variants.

The calendar is FullCalendar's shadcn event calendar in the forma flavour. It takes its colours from the theme.

## Layout

- Left sidebar, 256 px, collapsible to icons.
- Top bar, 48 px.
- Content fills the rest. Lists have a readable maximum width of 880 px; the calendar and tables use the full width.
- Panels open as a sheet on the right, 480 px.

## Wording

Short, plain and specific. Sentence case. Buttons say what they do: "Apply import", not "Submit". Dates as "Tue 24 Nov"; times as "14:00".
