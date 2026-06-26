// non-secret constants. the hero must never depend on the airports dataset
// loading, so HKG and SZX are hardcoded here. see SPEC sections 5, 7, 8, 11.

export const DESTINATIONS = ["HKG", "SZX"] as const;
export type Destination = (typeof DESTINATIONS)[number];

export interface AirportMeta {
  iata: Destination;
  name: string;
  icao: string;
  lat: number;
  lon: number;
  /** IANA timezone, for ETA clock formatting. both are UTC+8, no DST. */
  tz: string;
}

export const AIRPORTS: Record<Destination, AirportMeta> = {
  HKG: {
    iata: "HKG",
    name: "Hong Kong Intl",
    icao: "VHHH",
    lat: 22.308,
    lon: 113.918,
    tz: "Asia/Hong_Kong",
  },
  SZX: {
    iata: "SZX",
    name: "Shenzhen Bao'an",
    icao: "ZGSZ",
    lat: 22.639,
    lon: 113.811,
    tz: "Asia/Shanghai",
  },
};

// --- status derivation thresholds (SPEC section 5) ---
/** above this barometric altitude (ft) a matched aircraft counts as airborne. */
export const GROUND_ALT_THRESHOLD_FT = 75;
/** within this distance (nm) of its destination, an on-ground plane is landed. */
export const LANDED_RADIUS_NM = 8;
/** if last seen airborne within this window and gone from feed, count as landed. */
export const LANDED_MEMORY_WINDOW_MS = 4 * 60 * 60 * 1000;
/** below this ground speed (kt) we do not compute an ETA. */
export const MIN_GROUND_SPEED_FOR_ETA_KT = 50;

// --- timing (SPEC sections 2, 3, 6, 8) ---
/** browser poll cadence for /api/state. */
export const POLL_INTERVAL_MS = 15_000;
/** how long the upstream feed result is cached server-side. */
export const FEED_CACHE_WINDOW_S = 10;
/** edge cache for /api/state. */
export const STATE_EDGE_MAXAGE_S = 8;
export const STATE_STALE_WHILE_REVALIDATE_S = 30;

// --- feed geometry (SPEC section 3) ---
/** Pearl River Delta centroid. the feed bubble and range rings center here. */
export const PRD_CENTROID = { lat: 22.47, lon: 113.86 };
/** [lat, lon, radiusNm]. one bubble covers HKG, SZX, and the approach corridor. */
export type FeedCenter = [number, number, number];
export const DEFAULT_CENTERS: FeedCenter[] = [[22.47, 113.86, 250]];
/** max radius adsb.lol / airplanes.live allow per query. */
export const MAX_FEED_RADIUS_NM = 250;

// --- map (SPEC section 8) ---
export const MAP_DEFAULT_CENTER: [number, number] = [113.86, 22.5]; // [lon, lat]
export const MAP_DEFAULT_ZOOM = 6.5;
/** concentric radar rings. the 250 nm ring is literally the feed bubble. */
export const RANGE_RINGS_NM = [50, 150, 250];

// --- event (SPEC sections 10, 11) ---
export const EVENT_NAME = process.env.NEXT_PUBLIC_EVENT_NAME ?? "Fallout 2026";
export const EVENT_START_ISO =
  process.env.NEXT_PUBLIC_EVENT_START_ISO ?? "2026-07-01T00:00:00+08:00";
/** target cohort size, for the "N of M arrived" counter. */
export const COHORT_SIZE = 100;

export const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

/**
 * parse ADSB_CENTERS env override if present, else the default PRD bubble.
 * kept tiny and dependency-free so it is safe to call on the server.
 */
export function resolveCenters(
  raw: string | undefined = process.env.ADSB_CENTERS,
): FeedCenter[] {
  if (!raw) return DEFAULT_CENTERS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (c): c is FeedCenter =>
          Array.isArray(c) &&
          c.length === 3 &&
          c.every((n) => typeof n === "number" && Number.isFinite(n)),
      )
    ) {
      return parsed;
    }
  } catch {
    // fall through to default on malformed override
  }
  return DEFAULT_CENTERS;
}
