import type { Status } from "./status";

// small display formatters shared by the board, the map popups, and counters.
// keep copy lowercase-leaning, no filler.

// a placeholder for missing values. not an em dash (project copy rule).
const DASH = "·";

export function formatAltFt(altFt: number | null | undefined): string {
  if (altFt == null) return DASH;
  return `${Math.round(altFt).toLocaleString("en-US")} ft`;
}

export function formatSpeedKt(kt: number | null | undefined): string {
  if (kt == null) return DASH;
  return `${Math.round(kt)} kt`;
}

export function formatDistanceNm(nm: number | null | undefined): string {
  if (nm == null) return DASH;
  return `${Math.round(nm)} nm`;
}

export function formatEtaMinutes(min: number | null | undefined): string {
  if (min == null) return DASH;
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem.toString().padStart(2, "0")}m`;
}

export const STATUS_LABEL: Record<Status, string> = {
  air: "in air",
  landed: "landed",
  expected: "expected",
};

/** tailwind text color token per status. air=cyan, landed=jade, expected=muted. */
export function statusColorClass(status: Status): string {
  switch (status) {
    case "air":
      return "text-cyan";
    case "landed":
      return "text-jade";
    case "expected":
      return "text-muted";
  }
}

export interface CountdownParts {
  done: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** break a millisecond gap into d/h/m/s for the countdown. clamps at zero. */
export function countdownParts(msUntil: number): CountdownParts {
  if (msUntil <= 0) {
    return { done: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSeconds = Math.floor(msUntil / 1000);
  return {
    done: false,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}
