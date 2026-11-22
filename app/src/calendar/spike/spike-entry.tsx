// Entry for the from-disk check (from-disk-check.js): only DiaryCalendar, with
// the synthetic diary, styled by the app's own stylesheet added as the app's
// mount() adds it. Not imported by the app, so not in the app bundle.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import css from "../../index.css?inline";
import { DiaryCalendar, type DiaryView } from "../diary-calendar";
import { SPIKE_TIME_ZONE, SPIKE_WEEK, SYNTHETIC_EVENTS } from "./synthetic-events";

interface SpikeCalendarProps {
  id: string;
  initialView: DiaryView;
  initialDate: string;
}

function SpikeCalendar({ id, initialView, initialDate }: SpikeCalendarProps) {
  const [view, setView] = useState<DiaryView>(initialView);
  const [date, setDate] = useState(initialDate);
  const [clicked, setClicked] = useState("");
  return (
    <section id={id} data-clicked={clicked} className="flex flex-col gap-2">
      <DiaryCalendar
        events={SYNTHETIC_EVENTS}
        view={view}
        date={date}
        timeZone={SPIKE_TIME_ZONE}
        dayStart="08:00"
        dayEnd="18:00"
        onEventClick={setClicked}
        onNavigate={setDate}
        onViewChange={setView}
      />
    </section>
  );
}

const style = document.createElement("style");
style.textContent = css;
document.head.append(style);

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <main className="flex flex-col gap-6 p-6">
      <SpikeCalendar id="week" initialView="week" initialDate={SPIKE_WEEK} />
      <SpikeCalendar id="before-change" initialView="day" initialDate="2026-10-23" />
    </main>,
  );
}
