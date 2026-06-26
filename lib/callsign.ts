import { iataToIcao } from "./airlines";

// flight number -> live ADS-B callsign matching. see SPEC section 4.
// kept structural (no import from lib/adsb) so the data layer tests stand alone.

/** minimal shape the matcher needs from a feed aircraft. */
export interface MatchableAircraft {
  hex: string;
  /** raw or trimmed callsign; we trim + uppercase before indexing. */
  callsign?: string | null;
  /** seconds since last position; lower is fresher. */
  seenPos?: number | null;
}

/** uppercase and strip every non-alphanumeric char. `cx 216` -> `CX216`. */
export function normalizeFlightNumber(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * candidate ADS-B callsigns for a marketing flight number, best guess first.
 * if an explicit override is given, that is the only candidate.
 */
export function callsignCandidates(
  flightNumber: string,
  override?: string | null,
): string[] {
  if (override && override.trim()) {
    return [normalizeFlightNumber(override)];
  }

  const normalized = normalizeFlightNumber(flightNumber);
  const candidates: string[] = [];

  // try a 2-char then a 3-char airline prefix.
  for (const prefixLen of [2, 3]) {
    if (normalized.length <= prefixLen) continue;
    const prefix = normalized.slice(0, prefixLen);
    const rest = normalized.slice(prefixLen);
    const icao = iataToIcao(prefix);
    // remainder must start with a digit to be a flight number.
    if (icao && /^[0-9]/.test(rest)) {
      candidates.push(icao + rest);
      const stripped = rest.replace(/^0+/, "");
      if (stripped && stripped !== rest) {
        candidates.push(icao + stripped);
      }
    }
  }

  // always also try the normalized input itself (covers direct ICAO callsigns).
  candidates.push(normalized);

  // dedupe, preserving priority order.
  return [...new Set(candidates)];
}

/**
 * index live aircraft by trimmed/uppercased callsign. when two aircraft share a
 * callsign, keep the one with the freshest position (smallest seenPos).
 */
export function buildCallsignIndex<T extends MatchableAircraft>(
  aircraft: T[],
): Map<string, T> {
  const index = new Map<string, T>();
  for (const ac of aircraft) {
    const cs = ac.callsign?.trim().toUpperCase();
    if (!cs) continue;
    const existing = index.get(cs);
    if (!existing) {
      index.set(cs, ac);
      continue;
    }
    const existingSeen = existing.seenPos ?? Number.POSITIVE_INFINITY;
    const nextSeen = ac.seenPos ?? Number.POSITIVE_INFINITY;
    if (nextSeen < existingSeen) index.set(cs, ac);
  }
  return index;
}

/**
 * match a participant's flight number against an indexed feed.
 * returns the first candidate that hits, or null.
 */
export function matchAircraft<T extends MatchableAircraft>(
  flightNumber: string,
  override: string | null | undefined,
  index: Map<string, T>,
): T | null {
  for (const candidate of callsignCandidates(flightNumber, override)) {
    const hit = index.get(candidate);
    if (hit) return hit;
  }
  return null;
}
