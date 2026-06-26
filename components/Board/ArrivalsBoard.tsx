"use client";

import { useMemo, type MouseEvent } from "react";
import type { ArrivalsBoardProps } from "@/lib/uiContracts";
import type { ParticipantState, LiveState } from "@/lib/apiState";
import type { Status } from "@/lib/status";
import type { Destination } from "@/lib/config";
import {
  formatAltFt,
  formatSpeedKt,
  formatEtaMinutes,
  STATUS_LABEL,
  statusColorClass,
} from "@/lib/format";
import SplitFlap from "./SplitFlap";

// the arrivals board. split-flap status cell that flips on change, grouped by
// status (in air, then expected, then landed), search highlight + dim, owned
// rows get an edit button, rows are keyboard activatable and center the map.
//
// all rows live in one <ul> keyed by id, with the group headers interleaved as
// sibling list items. that single shared parent is load-bearing: when a person
// changes status, react MOVES the same Row (and its SplitFlap) across groups
// instead of remounting it, so the value prop changes in place and the flip
// runs. render each group in its own list and the row remounts, which resets
// the flip and you never see it.
//
// the row is one compact flex layout (not a wide column grid): the board lives
// in a ~400px side panel on desktop, so a viewport-based multi-column grid would
// collapse the flexible columns to zero width. flex + min-w-0 fits any width.

const DASH = "·";

const GROUPS: { status: Status; label: string }[] = [
  { status: "air", label: "in air" },
  { status: "expected", label: "expected" },
  { status: "landed", label: "landed" },
];

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function compareNullableStr(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareNullableNum(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function originText(p: ParticipantState): string {
  if (!p.origin) return DASH;
  const { city, iata } = p.origin;
  return city ? `${city} (${iata})` : iata;
}

function etaText(live: LiveState): string {
  const parts = [
    live.etaLocal,
    live.etaMinutes != null ? `(${formatEtaMinutes(live.etaMinutes)})` : null,
  ].filter((x): x is string => Boolean(x));
  return parts.length > 0 ? parts.join(" ") : DASH;
}

function matchesQuery(p: ParticipantState, q: string): boolean {
  if (!q) return false;
  const hay = [
    p.name,
    p.flightNumber,
    p.slackHandle ?? "",
    p.origin?.city ?? "",
    p.origin?.iata ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function destChipClass(dest: Destination): string {
  return dest === "HKG"
    ? "border-amber/40 bg-amber/10 text-amber"
    : "border-[rgba(157,168,255,0.45)] bg-[rgba(157,168,255,0.12)] text-[#9DA8FF]";
}

// describes the whole row for assistive tech. a missing field is omitted, never
// voiced as a placeholder (so no stray "altitude ·").
function rowAriaLabel(p: ParticipantState): string {
  const bits: string[] = [
    p.name,
    STATUS_LABEL[p.status],
    `flight ${p.flightNumber}`,
    `to ${p.destination}`,
  ];
  if (p.origin) bits.push(`from ${originText(p)}`);
  if (p.live) {
    if (p.live.altFt != null)
      bits.push(`altitude ${formatAltFt(p.live.altFt)}`);
    if (p.live.groundSpeedKt != null) {
      bits.push(`ground speed ${formatSpeedKt(p.live.groundSpeedKt)}`);
    }
    if (p.live.etaLocal || p.live.etaMinutes != null) {
      bits.push(`eta ${etaText(p.live)}`);
    }
  }
  return bits.join(", ");
}

function DestChip({ dest }: { dest: Destination }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        destChipClass(dest),
      )}
    >
      {dest}
    </span>
  );
}

function LiveMeta({ live }: { live: LiveState }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap tabular-nums">
      <span className="text-text">{formatAltFt(live.altFt)}</span>
      <span aria-hidden className="px-1 text-line">
        ·
      </span>
      <span className="text-muted">{formatSpeedKt(live.groundSpeedKt)}</span>
      <span aria-hidden className="px-1 text-line">
        ·
      </span>
      <span className="text-cyan">{etaText(live)}</span>
    </span>
  );
}

interface RowProps {
  p: ParticipantState;
  selected: boolean;
  owned: boolean;
  dimmed: boolean;
  highlighted: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
}

function Row({
  p,
  selected,
  owned,
  dimmed,
  highlighted,
  onSelect,
  onEdit,
}: RowProps) {
  function handleRowClick() {
    // pointer convenience: clicking anywhere on the row centers the map.
    onSelect(p.id);
  }

  function handleNameClick(e: MouseEvent<HTMLButtonElement>) {
    // the name button is the real control for keyboard + assistive tech.
    // stop it bubbling so we do not also fire the row container handler.
    e.stopPropagation();
    onSelect(p.id);
  }

  function handleEditClick(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    onEdit(p.id);
  }

  return (
    <li>
      {/* plain container: clickable for pointer users, but not itself a control.
          the real controls (center map via the name, edit) are sibling buttons,
          so we never nest a focusable button inside a button. */}
      <div
        onClick={handleRowClick}
        className={cx(
          "flex cursor-pointer items-center gap-3 rounded-md border-l-2 px-2 py-2 transition-colors sm:px-3",
          selected
            ? "border-amber bg-panel-2"
            : "border-transparent hover:bg-panel-2",
          highlighted && "ring-1 ring-inset ring-amber/50",
          dimmed && "opacity-40",
        )}
      >
        {/* status, flips on change. decorative; the name button voices it. */}
        <div aria-hidden className="w-[4.25rem] shrink-0">
          <SplitFlap
            value={STATUS_LABEL[p.status]}
            className={statusColorClass(p.status)}
          />
        </div>

        {/* who + a compact meta line that fits any width */}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={handleNameClick}
            aria-current={selected ? "true" : undefined}
            aria-label={rowAriaLabel(p)}
            className="block w-full truncate text-left font-sans text-sm font-medium text-text"
          >
            {p.name}
          </button>
          {p.slackHandle && (
            <span className="block truncate font-mono text-xs text-muted">
              {p.slackHandle}
            </span>
          )}
          <div
            aria-hidden
            className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted"
          >
            <span className="text-text">{p.flightNumber}</span>
            <span className="text-line">·</span>
            <span className="truncate">{originText(p)}</span>
            {p.live && (
              <>
                <span className="text-line">·</span>
                <LiveMeta live={p.live} />
              </>
            )}
          </div>
        </div>

        {/* destination tag, colored per airport */}
        <div aria-hidden className="shrink-0">
          <DestChip dest={p.destination} />
        </div>

        {/* edit: sibling button, exposed to assistive tech */}
        {owned && (
          <button
            type="button"
            onClick={handleEditClick}
            aria-label={`edit ${p.name}`}
            className="shrink-0 rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-amber/50 hover:text-amber"
          >
            edit
          </button>
        )}
      </div>
    </li>
  );
}

export default function ArrivalsBoard({
  participants,
  query,
  selectedId,
  ownedIds,
  onSelectParticipant,
  onEditParticipant,
}: ArrivalsBoardProps) {
  const q = query.trim().toLowerCase();
  const owned = useMemo(() => new Set(ownedIds), [ownedIds]);

  const groups = useMemo(() => {
    return GROUPS.map((g) => {
      const rows = participants
        .filter((p) => p.status === g.status)
        .sort((a, b) => {
          if (g.status === "expected") {
            const d = compareNullableStr(a.arrivalDate, b.arrivalDate);
            if (d !== 0) return d;
          } else if (g.status === "air") {
            const d = compareNullableNum(
              a.live?.etaMinutes ?? null,
              b.live?.etaMinutes ?? null,
            );
            if (d !== 0) return d;
          }
          return a.name.localeCompare(b.name);
        });
      return { ...g, rows };
    });
  }, [participants]);

  if (participants.length === 0) {
    return (
      <section
        aria-label="arrivals board"
        className="rounded-lg border border-line bg-panel"
      >
        <p className="px-3 py-12 text-center font-sans text-sm text-muted">
          no flights on the board yet, add yours to drop the first dot.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="arrivals board"
      className="rounded-lg border border-line bg-panel"
    >
      {/* one list for every row so React moves a Row across groups on a status
          change instead of remounting it, which is what lets the flip run. */}
      <div className="px-1 py-2 sm:px-2">
        <ul role="list" className="flex flex-col gap-0.5">
          {groups.flatMap((g) =>
            g.rows.length === 0
              ? []
              : [
                  <li
                    key={`header-${g.status}`}
                    role="presentation"
                    className="flex items-center gap-2 px-2 pb-1 pt-4 first:pt-2 sm:px-3"
                  >
                    <span
                      aria-hidden
                      className={cx(
                        "h-1.5 w-1.5 rounded-full bg-current",
                        statusColorClass(g.status),
                      )}
                    />
                    <h3 className="font-display text-xs uppercase tracking-[0.22em] text-muted">
                      {g.label}
                    </h3>
                    <span className="font-mono text-[11px] tabular-nums text-muted">
                      {g.rows.length}
                    </span>
                    <span aria-hidden className="ml-1 h-px flex-1 bg-line" />
                  </li>,
                  ...g.rows.map((p) => {
                    const isMatch = matchesQuery(p, q);
                    return (
                      <Row
                        key={p.id}
                        p={p}
                        selected={p.id === selectedId}
                        owned={owned.has(p.id)}
                        highlighted={Boolean(q) && isMatch}
                        dimmed={Boolean(q) && !isMatch}
                        onSelect={onSelectParticipant}
                        onEdit={onEditParticipant}
                      />
                    );
                  }),
                ],
          )}
        </ul>
      </div>
    </section>
  );
}
