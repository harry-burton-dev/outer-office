// The records a log row's From and To can name, read once for a whole table.
import { useMemo } from "react";
import { useRecords } from "@trellis/framework";
import { ADMIN_ID, usePeople } from "@/app/people";
import type { LogLookups } from "./log-refs";

export function useLogLookups(): LogLookups {
  const sections = useRecords("sections", { includeDeleted: true });
  const events = useRecords("events", { includeDeleted: true });
  const people = usePeople();
  return useMemo(() => {
    const sectionNames = new Map(sections.map((s) => [s.id, s.name ?? ""]));
    const subjects = new Map(events.map((e) => [e.id, e.subject ?? ""]));
    const known = new Set([...people.list.map((u) => u.id), ADMIN_ID]);
    return {
      sectionName: (id) => sectionNames.get(id),
      eventSubject: (id) => subjects.get(id),
      userName: (id) => (known.has(id) ? people.nameOf(id) : undefined),
    };
  }, [sections, events, people]);
}
