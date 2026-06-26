import { describe, it, expect } from "vitest";
import {
  deriveStatus,
  isAirborne,
  etaMinutes,
  etaClock,
  type StatusAircraft,
} from "@/lib/status";
import { AIRPORTS } from "@/lib/config";

const NOW = new Date("2026-07-01T06:00:00Z"); // 14:00 in HKT/CST

const air: StatusAircraft = {
  altBaro: 35000,
  lat: 24.1,
  lon: 110.2,
  groundSpeedKt: 451,
};

describe("isAirborne", () => {
  it("is true above the ground floor, false on the ground", () => {
    expect(isAirborne(35000)).toBe(true);
    expect(isAirborne(50)).toBe(false); // below 75 ft
    expect(isAirborne("ground")).toBe(false);
    expect(isAirborne(null)).toBe(false);
  });
});

describe("deriveStatus truth table", () => {
  it("airborne -> air, with live numbers and an airborne flag", () => {
    const r = deriveStatus({
      destination: "HKG",
      arrivalDate: "2026-07-01",
      lastSeenAirborneAt: null,
      aircraft: air,
      now: NOW,
    });
    expect(r.status).toBe("air");
    expect(r.airborne).toBe(true);
    expect(r.live?.distToDestNm).toBeGreaterThan(0);
  });

  it("on ground near destination -> landed", () => {
    const r = deriveStatus({
      destination: "HKG",
      arrivalDate: "2026-07-01",
      lastSeenAirborneAt: null,
      aircraft: {
        altBaro: "ground",
        lat: AIRPORTS.HKG.lat,
        lon: AIRPORTS.HKG.lon,
        groundSpeedKt: 0,
      },
      now: NOW,
    });
    expect(r.status).toBe("landed");
    expect(r.airborne).toBe(false);
    expect(r.live).toBeNull();
  });

  it("on ground far from destination -> expected", () => {
    const r = deriveStatus({
      destination: "HKG",
      arrivalDate: "2026-07-01",
      lastSeenAirborneAt: null,
      aircraft: {
        altBaro: "ground",
        lat: 28.5665,
        lon: 77.1031,
        groundSpeedKt: 0,
      },
      now: NOW,
    });
    expect(r.status).toBe("expected");
  });

  it("not matched + recent airborne + arrived -> landed", () => {
    const r = deriveStatus({
      destination: "HKG",
      arrivalDate: "2026-07-01",
      lastSeenAirborneAt: new Date(NOW.getTime() - 60 * 60 * 1000), // 1h ago
      aircraft: null,
      now: NOW,
    });
    expect(r.status).toBe("landed");
  });

  it("not matched + airborne too long ago -> expected", () => {
    const r = deriveStatus({
      destination: "HKG",
      arrivalDate: "2026-07-01",
      lastSeenAirborneAt: new Date(NOW.getTime() - 5 * 60 * 60 * 1000), // 5h ago
      aircraft: null,
      now: NOW,
    });
    expect(r.status).toBe("expected");
  });

  it("not matched + recent airborne but arrival is in the future -> expected", () => {
    const r = deriveStatus({
      destination: "HKG",
      arrivalDate: "2026-07-09",
      lastSeenAirborneAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      aircraft: null,
      now: NOW,
    });
    expect(r.status).toBe("expected");
  });

  it("not matched + nothing -> expected", () => {
    const r = deriveStatus({
      destination: "SZX",
      arrivalDate: null,
      lastSeenAirborneAt: null,
      aircraft: null,
      now: NOW,
    });
    expect(r.status).toBe("expected");
  });
});

describe("ETA", () => {
  it("computes minutes from distance over ground speed", () => {
    expect(etaMinutes(240, 451)).toBeCloseTo(31.9, 1);
  });

  it("returns null below 50 kt", () => {
    expect(etaMinutes(240, 40)).toBeNull();
    expect(etaMinutes(240, null)).toBeNull();
  });

  it("treats exactly 50 kt as too slow and 51 kt as fast enough", () => {
    expect(etaMinutes(240, 50)).toBeNull();
    expect(etaMinutes(240, 51)).not.toBeNull();
  });

  it("formats the eta clock in the destination timezone", () => {
    // NOW + 32 min = 06:32 UTC = 14:32 in both HKT and CST (UTC+8).
    const arrival = new Date(NOW.getTime() + 32 * 60_000);
    expect(etaClock(arrival, AIRPORTS.HKG.tz)).toBe("14:32");
    expect(etaClock(arrival, AIRPORTS.SZX.tz)).toBe("14:32");
  });
});
