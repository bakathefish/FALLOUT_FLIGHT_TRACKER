import { AIRPORTS, DESTINATIONS, type Destination } from "./config";
import { buildCallsignIndex, matchAircraft } from "./callsign";
import { deriveStatus, type Status } from "./status";
import { lookupAirport } from "./airports";

// the /api/state payload contract (SPEC section 6) plus the pure function that
// builds it. kept free of the db and feed modules so it unit-tests on its own;
// the route just fetches, lists, assembles, and touches last_seen.

export interface AirportPoint {
  name: string;
  icao: string;
  lat: number;
  lon: number;
}

export interface OriginPoint {
  iata: string;
  city: string | null;
  lat: number;
  lon: number;
}

export interface LiveState {
  callsign: string;
  lat: number;
  lon: number;
  track: number | null;
  altFt: number | null;
  groundSpeedKt: number | null;
  aircraftType: string | null;
  registration: string | null;
  distToDestNm: number | null;
  etaMinutes: number | null;
  etaLocal: string | null;
}

export interface ParticipantState {
  id: string;
  name: string;
  slackHandle: string | null;
  flightNumber: string;
  destination: Destination;
  arrivalDate: string | null;
  origin: OriginPoint | null;
  status: Status;
  live: LiveState | null;
}

export interface StateResponse {
  updatedAt: string;
  trafficInRange: number;
  attribution: string;
  airports: Record<Destination, AirportPoint>;
  participants: ParticipantState[];
}

/** the participant fields assembleState needs; db rows satisfy this. */
export interface ParticipantRow {
  id: string;
  name: string;
  slackHandle: string | null;
  flightNumber: string;
  callsignOverride: string | null;
  originIata: string | null;
  originCity: string | null;
  destination: Destination;
  arrivalDate: string | null;
  lastSeenAirborneAt: Date | string | null;
}

/** the feed aircraft fields we read; lib/adsb Aircraft satisfies this. */
export interface FeedAircraft {
  hex: string;
  callsign: string | null;
  registration: string | null;
  aircraftType: string | null;
  altBaro: number | "ground" | null;
  groundSpeedKt: number | null;
  track: number | null;
  lat: number | null;
  lon: number | null;
  seenPos: number | null;
}

export interface AssembleInput {
  participants: ParticipantRow[];
  aircraft: FeedAircraft[];
  trafficInRange: number;
  attribution: string;
  now?: Date;
}

export interface AssembleResult {
  response: StateResponse;
  /** ids observed airborne right now; the route persists last_seen for these. */
  airborneIds: string[];
}

function airportsPayload(): Record<Destination, AirportPoint> {
  const out = {} as Record<Destination, AirportPoint>;
  for (const dest of DESTINATIONS) {
    const a = AIRPORTS[dest];
    out[dest] = { name: a.name, icao: a.icao, lat: a.lat, lon: a.lon };
  }
  return out;
}

function resolveOrigin(
  originIata: string | null,
  originCity: string | null,
): OriginPoint | null {
  const airport = lookupAirport(originIata);
  if (!airport) return null;
  return {
    iata: airport.iata,
    city: originCity ?? airport.city ?? null,
    lat: airport.lat,
    lon: airport.lon,
  };
}

/** combine live feed + participant rows into the state payload. pure. */
export function assembleState(input: AssembleInput): AssembleResult {
  const now = input.now ?? new Date();
  const index = buildCallsignIndex(input.aircraft);
  const airborneIds: string[] = [];

  const participants: ParticipantState[] = input.participants.map((p) => {
    const match = matchAircraft(p.flightNumber, p.callsignOverride, index);
    const derived = deriveStatus({
      destination: p.destination,
      arrivalDate: p.arrivalDate,
      lastSeenAirborneAt: p.lastSeenAirborneAt,
      aircraft: match,
      now,
    });

    if (derived.airborne) airborneIds.push(p.id);

    // only emit live when we can actually place the dot.
    const placeable =
      derived.status === "air" &&
      match != null &&
      match.lat != null &&
      match.lon != null;

    const live: LiveState | null = placeable
      ? {
          callsign: match.callsign ?? "",
          lat: match.lat as number,
          lon: match.lon as number,
          track: match.track,
          altFt: typeof match.altBaro === "number" ? match.altBaro : null,
          groundSpeedKt: match.groundSpeedKt,
          aircraftType: match.aircraftType,
          registration: match.registration,
          distToDestNm: derived.live?.distToDestNm ?? null,
          etaMinutes: derived.live?.etaMinutes ?? null,
          etaLocal: derived.live?.etaLocal ?? null,
        }
      : null;

    return {
      id: p.id,
      name: p.name,
      slackHandle: p.slackHandle,
      flightNumber: p.flightNumber,
      destination: p.destination,
      arrivalDate: p.arrivalDate,
      origin: resolveOrigin(p.originIata, p.originCity),
      status: derived.status,
      live,
    };
  });

  return {
    response: {
      updatedAt: now.toISOString(),
      trafficInRange: input.trafficInRange,
      attribution: input.attribution,
      airports: airportsPayload(),
      participants,
    },
    airborneIds,
  };
}
