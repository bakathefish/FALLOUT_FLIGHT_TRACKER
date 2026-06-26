import { getAircraft, ADSB_ATTRIBUTION } from "./adsb";
import {
  listParticipants,
  touchLastSeenAirborne,
  type DB,
  type Participant,
} from "./db/repo";
import {
  assembleState,
  type ParticipantRow,
  type StateResponse,
} from "./apiState";
import type { Destination } from "./config";

// the single read path behind /api/state and the server-rendered page. fetch
// the feed (cached, never throws), list participants, assemble the payload, and
// stamp last_seen for anyone airborne. resilient: a db hiccup still renders the
// map (airports + rings) with an empty board rather than 500-ing the whole app.

function toRow(p: Participant): ParticipantRow {
  return {
    id: p.id,
    name: p.name,
    slackHandle: p.slackHandle,
    flightNumber: p.flightNumber,
    callsignOverride: p.callsignOverride,
    originIata: p.originIata,
    originCity: p.originCity,
    // the destination CHECK constraint guarantees this is HKG or SZX.
    destination: p.destination as Destination,
    arrivalDate: p.arrivalDate,
    lastSeenAirborneAt: p.lastSeenAirborneAt,
  };
}

// read participants, degrading to an empty board if the db is unreachable or
// unconfigured. the try wraps the call itself so even a synchronous getDb()
// throw (e.g. missing DATABASE_URL) is caught, keeping the map renderable.
async function readRows(db?: DB): Promise<Participant[]> {
  try {
    return await listParticipants(db);
  } catch (err) {
    console.error("getState: could not read participants", err);
    return [];
  }
}

export async function getState(opts?: {
  db?: DB;
  now?: Date;
}): Promise<StateResponse> {
  const now = opts?.now ?? new Date();

  const [snapshot, rows] = await Promise.all([
    getAircraft(),
    readRows(opts?.db),
  ]);

  const { response, airborneIds } = assembleState({
    participants: rows.map(toRow),
    aircraft: snapshot.aircraft,
    trafficInRange: snapshot.trafficInRange,
    attribution: ADSB_ATTRIBUTION,
    now,
  });

  if (airborneIds.length > 0) {
    try {
      await touchLastSeenAirborne(airborneIds, now, opts?.db);
    } catch (err) {
      console.error("getState: could not stamp last_seen", err);
    }
  }

  return response;
}
