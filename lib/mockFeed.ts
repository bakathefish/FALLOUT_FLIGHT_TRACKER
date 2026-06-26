import type { Aircraft } from "./adsb";

// deterministic mock feed for MOCK_ADSB=1. used in dev and e2e so the map has a
// moving dot without touching the real feeds. CPA216 sits over the pearl river
// delta so a participant on flight CX216 matches it and shows a moving plane.

const MOCK_AIRCRAFT: readonly Aircraft[] = [
  {
    hex: "abc123",
    callsign: "CPA216",
    registration: "B-LXA",
    aircraftType: "B789",
    altBaro: 35000,
    groundSpeedKt: 450,
    track: 120,
    lat: 24.0,
    lon: 111.0,
    seenPos: 2,
  },
  {
    hex: "def456",
    callsign: "UAL862",
    registration: "N2748U",
    aircraftType: "B77W",
    altBaro: 37000,
    groundSpeedKt: 478,
    track: 95,
    lat: 21.8,
    lon: 112.6,
    seenPos: 3,
  },
  {
    hex: "789abc",
    callsign: "SIA890",
    registration: "9V-SMT",
    aircraftType: "A359",
    altBaro: 30000,
    groundSpeedKt: 465,
    track: 108,
    lat: 23.2,
    lon: 112.1,
    seenPos: 4,
  },
  {
    // sitting on the ground at HKG, so it reads as landed, not a dot.
    hex: "456def",
    callsign: "HDA635",
    registration: "B-LPA",
    aircraftType: "A320",
    altBaro: "ground",
    groundSpeedKt: 0,
    track: 270,
    lat: 22.308,
    lon: 113.918,
    seenPos: 6,
  },
];

/** a fresh copy of the deterministic mock aircraft set. */
export function mockAircraft(): Aircraft[] {
  return MOCK_AIRCRAFT.map((ac) => ({ ...ac }));
}
