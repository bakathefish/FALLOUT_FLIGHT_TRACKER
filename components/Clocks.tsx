"use client";

import { useEffect, useState } from "react";

// two live clocks for the header: hong kong time and utc, updating each second.
// render a stable placeholder until mounted so the server and first client
// render agree (no hydration mismatch), then start ticking.

const HKT_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Hong_Kong",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const UTC_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const PLACEHOLDER = "--:--:--";

export default function Clocks() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="flex items-center gap-4"
      role="group"
      aria-label="current time"
    >
      <ClockCell label="hkt" value={now ? HKT_FMT.format(now) : PLACEHOLDER} />
      <ClockCell label="utc" value={now ? UTC_FMT.format(now) : PLACEHOLDER} />
    </div>
  );
}

function ClockCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-[10px] uppercase tracking-[0.25em] text-muted">
        {label}
      </span>
      <span
        className="font-mono text-sm tabular-nums text-text"
        suppressHydrationWarning
      >
        {value}
      </span>
    </div>
  );
}
