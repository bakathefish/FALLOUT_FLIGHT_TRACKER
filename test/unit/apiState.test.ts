import { describe, it, expect } from "vitest";
import {
  assembleState,
  type ParticipantRow,
  type FeedAircraft,
} from "@/lib/apiState";
import { AIRPORTS } from "@/lib/config";

const NOW = new Date("2026-07-01T06:00:00Z");

const aircraft: FeedAircraft[] = [
  {
    hex: "abc123",
    callsign: "CPA216",
    registration: "B-LXA",
    aircraftType: "B789",
    altBaro: 35000,
    groundSpeedKt: 451,
    track: 118,
    lat: 24.1,
    lon: 110.2,
    seenPos: 2,
  },
  {
    hex: "def456",
    callsign: "HKE541",
    registration: "B-LPA",
    aircraftType: "A320",
    altBaro: "ground",
    groundSpeedKt: 0,
    track: 0,
    lat: AIRPORTS.HKG.lat,
    lon: AIRPORTS.HKG.lon,
    seenPos: 1,
  },
];

const base: Omit<
  ParticipantRow,
  "id" | "name" | "flightNumber" | "destination"
> = {
  slackHandle: null,
  callsignOverride: null,
  originIata: null,
  originCity: null,
  arrivalDate: "2026-07-01",
  lastSeenAirborneAt: null,
};

describe("assembleState", () => {
  it("builds the documented payload shape", () => {
    const { response } = assembleState({
      participants: [],
      aircraft: [],
      trafficInRange: 53,
      attribution: "data: adsb.lol (ODbL) and airplanes.live",
      now: NOW,
    });
    expect(response.updatedAt).toBe(NOW.toISOString());
    expect(response.trafficInRange).toBe(53);
    expect(response.attribution).toContain("adsb.lol");
    expect(response.airports.HKG.icao).toBe("VHHH");
    expect(response.airports.SZX.icao).toBe("ZGSZ");
    expect(response.participants).toEqual([]);
  });

  it("matches an airborne participant and emits live numbers + origin", () => {
    const { response, airborneIds } = assembleState({
      participants: [
        {
          ...base,
          id: "p1",
          name: "Fish",
          flightNumber: "CX216",
          destination: "HKG",
          originIata: "DEL",
          originCity: "Delhi",
          slackHandle: "@fish",
        },
      ],
      aircraft,
      trafficInRange: 2,
      attribution: "x",
      now: NOW,
    });

    const p = response.participants[0]!;
    expect(p.status).toBe("air");
    expect(p.live).not.toBeNull();
    expect(p.live?.callsign).toBe("CPA216");
    expect(p.live?.altFt).toBe(35000);
    expect(p.live?.distToDestNm).toBeGreaterThan(0);
    expect(p.live?.etaMinutes).toBeGreaterThan(0);
    expect(p.origin?.iata).toBe("DEL");
    expect(p.origin?.city).toBe("Delhi");
    expect(p.origin?.lat).toBeGreaterThan(28);
    expect(airborneIds).toEqual(["p1"]);
  });

  it("marks an on-ground-at-destination participant landed with no live", () => {
    const { response, airborneIds } = assembleState({
      participants: [
        {
          ...base,
          id: "p2",
          name: "Sam",
          flightNumber: "UO541",
          destination: "HKG",
        },
      ],
      aircraft,
      trafficInRange: 2,
      attribution: "x",
      now: NOW,
    });
    const p = response.participants[0]!;
    expect(p.status).toBe("landed");
    expect(p.live).toBeNull();
    expect(airborneIds).toEqual([]);
  });

  it("falls back to expected and null origin when nothing matches", () => {
    const { response } = assembleState({
      participants: [
        {
          ...base,
          id: "p3",
          name: "Lee",
          flightNumber: "AI999",
          destination: "SZX",
          originIata: "ZZZ", // unknown airport
          originCity: "Nowhere",
        },
      ],
      aircraft,
      trafficInRange: 2,
      attribution: "x",
      now: NOW,
    });
    const p = response.participants[0]!;
    expect(p.status).toBe("expected");
    expect(p.live).toBeNull();
    expect(p.origin).toBeNull();
  });
});
