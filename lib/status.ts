import {
  AIRPORTS,
  GROUND_ALT_THRESHOLD_FT,
  LANDED_RADIUS_NM,
  LANDED_MEMORY_WINDOW_MS,
  MIN_GROUND_SPEED_FOR_ETA_KT,
  type Destination,
} from "./config";
import { distanceNm } from "./geo";

// status derivation + ETA. see SPEC section 5. unit tested with a truth table.
// section 6 lists "taxiing" as a possible value but section 5 (the source of
// truth that we test) derives exactly these three.
export type Status = "air" | "landed" | "expected";

/** the slice of a matched aircraft that status derivation needs. */
export interface StatusAircraft {
  altBaro: number | "ground" | null;
  lat: number | null;
  lon: number | null;
  groundSpeedKt: number | null;
}

export interface DeriveStatusInput {
  destination: Destination;
  /** 'YYYY-MM-DD' or null. */
  arrivalDate: string | null;
  lastSeenAirborneAt: Date | string | null;
  /** the matched aircraft, or null if no feed match. */
  aircraft: StatusAircraft | null;
  now?: Date;
}

/** derived live numbers for an airborne participant. */
export interface LiveDerived {
  distToDestNm: number | null;
  etaMinutes: number | null;
  etaLocal: string | null;
}

export interface DeriveStatusResult {
  status: Status;
  /** true when we observed it airborne now; caller should touch last_seen. */
  airborne: boolean;
  /** distance/eta, present only when airborne. */
  live: LiveDerived | null;
}

/** an aircraft is airborne when alt_baro is a number above the ground floor. */
export function isAirborne(altBaro: number | "ground" | null): boolean {
  return typeof altBaro === "number" && altBaro > GROUND_ALT_THRESHOLD_FT;
}

/** ETA in minutes, or null when too slow to mean anything. */
export function etaMinutes(
  distToDestNm: number,
  groundSpeedKt: number | null,
): number | null {
  if (groundSpeedKt == null || groundSpeedKt <= MIN_GROUND_SPEED_FOR_ETA_KT) {
    return null;
  }
  return (distToDestNm / groundSpeedKt) * 60;
}

/** format an arrival instant as a HH:MM clock in the destination timezone. */
export function etaClock(arrival: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(arrival);
}

/** calendar date 'YYYY-MM-DD' in a timezone, for the today-or-earlier check. */
function dateInTz(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function computeLive(
  ac: StatusAircraft,
  destLat: number,
  destLon: number,
  destTz: string,
  now: Date,
): LiveDerived {
  if (ac.lat == null || ac.lon == null) {
    return { distToDestNm: null, etaMinutes: null, etaLocal: null };
  }
  const distToDestNm = distanceNm(ac.lat, ac.lon, destLat, destLon);
  const mins = etaMinutes(distToDestNm, ac.groundSpeedKt);
  const etaLocal =
    mins == null
      ? null
      : etaClock(new Date(now.getTime() + mins * 60_000), destTz);
  return { distToDestNm, etaMinutes: mins, etaLocal };
}

export function deriveStatus(input: DeriveStatusInput): DeriveStatusResult {
  const now = input.now ?? new Date();
  const dest = AIRPORTS[input.destination];
  const ac = input.aircraft;

  if (ac) {
    if (isAirborne(ac.altBaro)) {
      return {
        status: "air",
        airborne: true,
        live: computeLive(ac, dest.lat, dest.lon, dest.tz, now),
      };
    }
    // matched but on the ground.
    if (ac.lat != null && ac.lon != null) {
      const dist = distanceNm(ac.lat, ac.lon, dest.lat, dest.lon);
      if (dist <= LANDED_RADIUS_NM) {
        return { status: "landed", airborne: false, live: null };
      }
    }
    // on the ground but not near the destination: still sitting at origin.
    return { status: "expected", airborne: false, live: null };
  }

  // no feed match. if we saw it airborne recently and it should be down, landed.
  if (input.lastSeenAirborneAt) {
    const last = new Date(input.lastSeenAirborneAt).getTime();
    const withinWindow = now.getTime() - last <= LANDED_MEMORY_WINDOW_MS;
    // null arrival date is treated leniently as "today or earlier".
    const arrivedOrEarlier =
      input.arrivalDate == null || input.arrivalDate <= dateInTz(now, dest.tz);
    if (withinWindow && arrivedOrEarlier) {
      return { status: "landed", airborne: false, live: null };
    }
  }

  return { status: "expected", airborne: false, live: null };
}
