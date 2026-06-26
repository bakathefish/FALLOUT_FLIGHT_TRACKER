"use client";

import type { CounterProps } from "@/lib/uiContracts";
import { COHORT_SIZE } from "@/lib/config";

// compact stat strip. counts by status, then "N of M arrived" where N is the
// landed count and M is the cohort target. status colors: air cyan, landed
// jade, expected muted. mono tabular numbers so the strip stays steady.

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

interface StatProps {
  value: number;
  label: string;
  color: string;
}

function Stat({ value, label, color }: StatProps) {
  // no aria-label here: assistive tech drops it on a generic div, so we lean on
  // the visible number + label text instead.
  return (
    <div className="flex flex-col">
      <span
        className={cx("text-xl font-semibold tabular-nums leading-none", color)}
      >
        {value}
      </span>
      <span className="mt-1 font-display text-[10px] uppercase tracking-[0.2em] text-muted">
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="w-px self-stretch bg-line" />;
}

export default function Counter({ participants }: CounterProps) {
  let air = 0;
  let landed = 0;
  let expected = 0;
  for (const p of participants) {
    if (p.status === "air") air += 1;
    else if (p.status === "landed") landed += 1;
    else expected += 1;
  }

  return (
    <div
      role="group"
      aria-label="cohort arrival counts"
      className="flex flex-wrap items-stretch gap-x-5 gap-y-2 font-mono"
    >
      <Stat value={air} label="in air" color="text-cyan" />
      <Divider />
      <Stat value={landed} label="landed" color="text-jade" />
      <Divider />
      <Stat value={expected} label="expected" color="text-muted" />
      <Divider />
      <div className="flex flex-col">
        <span className="text-xl font-semibold tabular-nums leading-none">
          <span className="text-jade">{landed}</span>
          <span className="text-muted"> / {COHORT_SIZE}</span>
        </span>
        <span className="mt-1 font-display text-[10px] uppercase tracking-[0.2em] text-muted">
          arrived
        </span>
      </div>
    </div>
  );
}
