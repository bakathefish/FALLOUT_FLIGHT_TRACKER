import { z } from "zod";
import {
  resolveCenters,
  MAX_FEED_RADIUS_NM,
  FEED_CACHE_WINDOW_S,
  type FeedCenter,
} from "./config";
import { mockAircraft } from "./mockFeed";

// ads-b feed access. adsb.lol primary, airplanes.live fallback, with an
// in-process ttl cache so 100 viewers share one upstream call per window.
// see SPEC sections 2 and 3. the real feed is never called in tests.

/** normalized aircraft. structurally compatible with StatusAircraft and
 * MatchableAircraft so the rest of the app can consume it directly. */
export interface Aircraft {
  hex: string;
  /** raw feed `flight`, trimmed + uppercased; null if blank. */
  callsign: string | null;
  /** raw `r`. */
  registration: string | null;
  /** raw `t`, e.g. "B789". */
  aircraftType: string | null;
  /** raw `alt_baro`: a number, the string "ground", or null. */
  altBaro: number | "ground" | null;
  /** raw `gs`. */
  groundSpeedKt: number | null;
  /** raw `track`. */
  track: number | null;
  lat: number | null;
  lon: number | null;
  /** raw `seen_pos`; seconds since last position, lower is fresher. */
  seenPos: number | null;
}

/** ODbL attribution, rendered in the UI. adsb.lol requires it. */
export const ADSB_ATTRIBUTION = "data: adsb.lol (ODbL) and airplanes.live";

export interface FeedSnapshot {
  aircraft: Aircraft[];
  /** count after de-duping by hex. */
  trafficInRange: number;
  source: "adsb.lol" | "airplanes.live" | "mock" | "none";
}

// airplanes.live wants a descriptive user-agent and caps at 1 req/sec. the
// cache keeps us well under that, so we never add artificial rate limiting.
const AIRPLANES_LIVE_UA =
  "fallout-arrivals/1.0 (hack club cohort flight board)";

// bail on a hung upstream so a stalled feed becomes a reject that falls back,
// instead of blocking the server render until the platform function times out.
// two sources run in sequence, so keep this well under the function limit.
const FEED_FETCH_TIMEOUT_MS = 4000;

// next augments fetch's RequestInit with this. typed here so non-next runtimes
// (like the test runner) just ignore the hint without a compile error.
interface NextFetchConfig {
  revalidate?: number | false;
  tags?: string[];
}
type FeedFetchInit = RequestInit & { next?: NextFetchConfig };

type LiveSource = "adsb.lol" | "airplanes.live";

const SOURCE_BASE_URL: Record<LiveSource, string> = {
  "adsb.lol": "https://api.adsb.lol/v2/point",
  "airplanes.live": "https://api.airplanes.live/v2/point",
};

// raw upstream aircraft. only hex is required; every other field tolerates a
// missing or junk value by collapsing to null, so a malformed feed can drop a
// single aircraft at worst and never crashes us.
const rawAircraftSchema = z.object({
  hex: z.string(),
  flight: z.string().nullish().catch(null),
  r: z.string().nullish().catch(null),
  t: z.string().nullish().catch(null),
  alt_baro: z
    .union([z.number(), z.literal("ground")])
    .nullish()
    .catch(null),
  gs: z.number().finite().nullish().catch(null),
  track: z.number().finite().nullish().catch(null),
  lat: z.number().finite().nullish().catch(null),
  lon: z.number().finite().nullish().catch(null),
  seen_pos: z.number().finite().nullish().catch(null),
});

const feedResponseSchema = z.object({
  ac: z.array(z.unknown()).optional(),
});

/** map one validated raw aircraft to the normalized shape. */
function normalizeRaw(raw: unknown): Aircraft | null {
  const parsed = rawAircraftSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  const callsign = r.flight?.trim().toUpperCase();
  return {
    hex: r.hex,
    callsign: callsign ? callsign : null,
    registration: r.r ?? null,
    aircraftType: r.t ?? null,
    altBaro: r.alt_baro ?? null,
    groundSpeedKt: r.gs ?? null,
    track: r.track ?? null,
    lat: r.lat ?? null,
    lon: r.lon ?? null,
    seenPos: r.seen_pos ?? null,
  };
}

/** parse a `{ ac: [...] }` body into normalized aircraft, dropping junk rows. */
function parseFeedBody(body: unknown): Aircraft[] {
  const parsed = feedResponseSchema.safeParse(body);
  const list = parsed.success ? (parsed.data.ac ?? []) : [];
  const out: Aircraft[] = [];
  for (const raw of list) {
    const ac = normalizeRaw(raw);
    if (ac) out.push(ac);
  }
  return out;
}

/** clamp a center's radius to what the feeds allow. */
function clampCenter(center: FeedCenter): FeedCenter {
  const [lat, lon, radius] = center;
  return [lat, lon, Math.min(radius, MAX_FEED_RADIUS_NM)];
}

/** fetch one center from one source. throws on reject or non-200. */
async function fetchCenter(
  center: FeedCenter,
  source: LiveSource,
): Promise<Aircraft[]> {
  const [lat, lon, radius] = center;
  const url = `${SOURCE_BASE_URL[source]}/${lat}/${lon}/${radius}`;
  const init: FeedFetchInit = {
    next: { revalidate: FEED_CACHE_WINDOW_S },
    signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS),
  };
  if (source === "airplanes.live") {
    init.headers = { "User-Agent": AIRPLANES_LIVE_UA };
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${source} responded ${res.status}`);
  }
  const body: unknown = await res.json();
  return parseFeedBody(body);
}

/** fetch every center from one source. returns null if any center fails so the
 * caller can fall back to the other source. */
async function fetchAllCenters(
  centers: FeedCenter[],
  source: LiveSource,
): Promise<Aircraft[] | null> {
  try {
    const perCenter = await Promise.all(
      centers.map((c) => fetchCenter(c, source)),
    );
    return perCenter.flat();
  } catch {
    return null;
  }
}

/** merge aircraft, de-dupe by hex (keep first seen), and wrap as a snapshot. */
function snapshotFrom(
  aircraft: Aircraft[],
  source: FeedSnapshot["source"],
): FeedSnapshot {
  const byHex = new Map<string, Aircraft>();
  for (const ac of aircraft) {
    if (!byHex.has(ac.hex)) byHex.set(ac.hex, ac);
  }
  const deduped = [...byHex.values()];
  return { aircraft: deduped, trafficInRange: deduped.length, source };
}

/** true when MOCK_ADSB is set to anything truthy other than "0". */
function mockEnabled(): boolean {
  const v = process.env.MOCK_ADSB;
  return v != null && v !== "" && v !== "0";
}

interface CacheEntry {
  at: number;
  snapshot: FeedSnapshot;
}
const cache = new Map<string, CacheEntry>();

/** reset the in-process cache. test seam only. */
export function __clearAdsbCache(): void {
  cache.clear();
}

async function buildSnapshot(centers: FeedCenter[]): Promise<FeedSnapshot> {
  // mock mode skips the network entirely.
  if (mockEnabled()) {
    return snapshotFrom(mockAircraft(), "mock");
  }
  // adsb.lol first.
  const primary = await fetchAllCenters(centers, "adsb.lol");
  if (primary) return snapshotFrom(primary, "adsb.lol");
  // any adsb.lol failure: refetch every center from airplanes.live.
  const fallback = await fetchAllCenters(centers, "airplanes.live");
  if (fallback) return snapshotFrom(fallback, "airplanes.live");
  // both down: return empty so the rest of the app still renders. do not throw.
  return { aircraft: [], trafficInRange: 0, source: "none" };
}

/**
 * live aircraft in our feed bubble(s). centers default to the PRD bubble.
 * cached in-process for FEED_CACHE_WINDOW_S so repeated callers within the
 * window share a single upstream fetch.
 */
export async function getAircraft(
  centers?: FeedCenter[],
): Promise<FeedSnapshot> {
  const resolved = (centers ?? resolveCenters()).map(clampCenter);
  const key = JSON.stringify(resolved);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < FEED_CACHE_WINDOW_S * 1000) {
    return cached.snapshot;
  }
  const snapshot = await buildSnapshot(resolved);
  cache.set(key, { at: Date.now(), snapshot });
  return snapshot;
}
