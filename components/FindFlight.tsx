"use client";

import { useMemo } from "react";
import type { FindFlightProps } from "@/lib/uiContracts";
import type { ParticipantState } from "@/lib/apiState";
import { STATUS_LABEL, statusColorClass } from "@/lib/format";
import { normalizeFlightNumber } from "@/lib/callsign";

// search box that finds people by flight number or name, groups matches by the
// flight they share, and lets you click anyone to center the map on their plane.

interface FlightGroup {
  flightNumber: string;
  people: ParticipantState[];
}

export default function FindFlight({
  query,
  onQueryChange,
  participants,
  onSelectParticipant,
}: FindFlightProps) {
  const trimmed = query.trim();

  const groups = useMemo<FlightGroup[]>(() => {
    if (!trimmed) return [];
    const nf = normalizeFlightNumber(trimmed);
    const name = trimmed.toLowerCase();
    const matched = participants.filter((p) => {
      const byFlight =
        nf.length > 0 && normalizeFlightNumber(p.flightNumber).includes(nf);
      const byName = p.name.toLowerCase().includes(name);
      return byFlight || byName;
    });
    const map = new Map<string, ParticipantState[]>();
    for (const p of matched) {
      const arr = map.get(p.flightNumber);
      if (arr) arr.push(p);
      else map.set(p.flightNumber, [p]);
    }
    return [...map.entries()].map(([flightNumber, people]) => ({
      flightNumber,
      people,
    }));
  }, [participants, trimmed]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="find your flight"
          placeholder="find your flight or name"
          className="w-full rounded border border-line bg-panel-2 px-3 py-2 pr-14 font-mono text-sm text-text placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            aria-label="clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs uppercase tracking-wide text-muted hover:text-text"
          >
            clear
          </button>
        )}
      </div>

      {trimmed.length > 0 && (
        <div
          className="rounded border border-line bg-panel p-2"
          role="region"
          aria-label="matching flights"
        >
          {groups.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted">
              no one on the board matches that yet. check the flight number or
              add yours.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {groups.map((g) => (
                <li key={g.flightNumber} className="flex flex-col gap-1">
                  <p className="px-1 font-mono text-xs uppercase tracking-wide text-amber">
                    {g.flightNumber}
                    {g.people.length > 1 && (
                      <span className="ml-2 text-muted">
                        {g.people.length} on board
                      </span>
                    )}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {g.people.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => onSelectParticipant(p.id)}
                          aria-label={`center map on ${p.name}, flight ${p.flightNumber}`}
                          className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left hover:bg-panel-2"
                        >
                          <span className="flex flex-col">
                            <span className="text-sm text-text">{p.name}</span>
                            {p.origin?.city && (
                              <span className="text-xs text-muted">
                                {p.origin.city}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-3">
                            <span
                              className={`text-xs ${statusColorClass(p.status)}`}
                            >
                              {STATUS_LABEL[p.status]}
                            </span>
                            <span className="text-xs text-muted">
                              center map
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
