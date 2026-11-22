// Synthetic diary for the calendar spike, its from-disk check and its tests.
// No real names. The UK clocks go back at 02:00 on Sunday 25 October 2026, so
// 09:00 London is 08:00Z on Friday 23 October and 09:00Z on Monday 26 October.
import type { DiaryEvent } from "../diary-calendar";

export const SPIKE_TIME_ZONE = "Europe/London";
export const SPIKE_WEEK = "2026-10-26";

export const SYNTHETIC_EVENTS: readonly DiaryEvent[] = [
  { id: "e1", title: "Weekly review", start: "2026-10-26T10:00:00Z", end: "2026-10-26T10:45:00Z", allDay: false },
  { id: "e2", title: "Team stand-up", start: "2026-10-26T11:00:00Z", end: "2026-10-26T11:15:00Z", allDay: false },
  { id: "e3", title: "Budget planning", start: "2026-10-27T13:00:00Z", end: "2026-10-27T14:30:00Z", allDay: false },
  { id: "e4", title: "Site visit", start: "2026-10-27T00:00:00Z", end: "2026-10-28T00:00:00Z", allDay: true },
  { id: "e5", title: "Board briefing", start: "2026-10-28T08:00:00Z", end: "2026-10-28T09:00:00Z", allDay: false },
  { id: "e6", title: "Lunch with partners", start: "2026-10-28T12:00:00Z", end: "2026-10-28T13:00:00Z", allDay: false },
  { id: "e7", title: "Strategy session", start: "2026-10-29T14:00:00Z", end: "2026-10-29T16:00:00Z", allDay: false },
  { id: "e8", title: "Press call", start: "2026-10-29T17:00:00Z", end: "2026-10-29T17:30:00Z", allDay: false },
  { id: "e9", title: "Travel day", start: "2026-10-30T00:00:00Z", end: "2026-10-31T00:00:00Z", allDay: true },
  { id: "e10", title: "Quarterly catch-up", start: "2026-10-30T11:00:00Z", end: "2026-10-30T12:00:00Z", allDay: false },
  { id: "e11", title: "Weekend reading", start: "2026-10-31T10:00:00Z", end: "2026-10-31T11:00:00Z", allDay: false },
  { id: "dst-before", title: "Morning check-in (BST)", start: "2026-10-23T08:00:00Z", end: "2026-10-23T09:00:00Z", allDay: false },
  { id: "dst-after", title: "Morning check-in (GMT)", start: "2026-10-26T09:00:00Z", end: "2026-10-26T10:00:00Z", allDay: false },
];
