"use client";

import type { HeaderProps } from "@/lib/uiContracts";
import { EVENT_NAME } from "@/lib/config";
import Clocks from "./Clocks";
import Countdown from "./Countdown";

// the top chrome: title, event kicker, live clocks, the countdown, and the
// prominent add-flight button. stacks on mobile, spreads out on wider screens.

export default function Header({ onAddFlight }: HeaderProps) {
  return (
    <header className="border-b border-line bg-panel">
      <div className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex flex-col gap-1">
          <span className="font-display text-[11px] uppercase tracking-[0.3em] text-amber">
            {EVENT_NAME}
          </span>
          <h1 className="font-display text-2xl font-bold leading-none tracking-tight text-text sm:text-3xl">
            FALLOUT <span className="text-muted">{"//"}</span> ARRIVALS{" "}
            <span className="text-muted">{"//"}</span> SHENZHEN
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4 md:gap-6">
          <Clocks />
          <Countdown />
          <button
            type="button"
            onClick={onAddFlight}
            className="rounded bg-amber px-4 py-2 font-display text-sm font-semibold uppercase tracking-wide text-bg transition-colors hover:bg-amber-bright"
          >
            add your flight
          </button>
        </div>
      </div>
    </header>
  );
}
