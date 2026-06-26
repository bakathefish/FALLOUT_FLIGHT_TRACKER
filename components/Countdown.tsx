"use client";

import { useEffect, useMemo, useState } from "react";
import { EVENT_NAME, EVENT_START_ISO } from "@/lib/config";
import { countdownParts, type CountdownParts } from "@/lib/format";

// counts down to the event start. renders a stable placeholder until mounted so
// the server and first client render agree, then ticks once a second. when the
// target passes, it switches to a calm "we are live" line.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export default function Countdown() {
  const target = useMemo(() => new Date(EVENT_START_ISO).getTime(), []);
  const [parts, setParts] = useState<CountdownParts | null>(null);

  useEffect(() => {
    const tick = () => setParts(countdownParts(target - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  if (parts?.done) {
    return (
      <div className="flex flex-col" role="status">
        <span className="font-display text-[10px] uppercase tracking-[0.25em] text-jade">
          live now
        </span>
        <span className="font-mono text-sm text-text">
          we are live, {EVENT_NAME.toLowerCase()}
        </span>
      </div>
    );
  }

  const cells: { label: string; value: string }[] = [
    { label: "days", value: parts ? String(parts.days) : "--" },
    { label: "hrs", value: parts ? pad(parts.hours) : "--" },
    { label: "min", value: parts ? pad(parts.minutes) : "--" },
    { label: "sec", value: parts ? pad(parts.seconds) : "--" },
  ];

  return (
    <div
      className="flex flex-col"
      role="group"
      aria-label="countdown to event start"
    >
      <span className="font-display text-[10px] uppercase tracking-[0.25em] text-muted">
        starts in
      </span>
      <div
        className="flex items-baseline gap-2 font-mono text-sm tabular-nums"
        suppressHydrationWarning
      >
        {cells.map((c) => (
          <span key={c.label} className="flex items-baseline gap-1">
            <span className="text-amber">{c.value}</span>
            <span className="text-[10px] text-muted">{c.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
