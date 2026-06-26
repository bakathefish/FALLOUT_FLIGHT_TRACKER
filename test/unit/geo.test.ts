import { describe, it, expect } from "vitest";
import {
  distanceNm,
  bearingDeg,
  destPoint,
  rangeRingPolygon,
  greatCirclePoints,
} from "@/lib/geo";

describe("distanceNm", () => {
  it("matches known city pairs within tolerance", () => {
    // LHR -> JFK is about 2998 nm.
    expect(distanceNm(51.4706, -0.4619, 40.6413, -73.7781)).toBeCloseTo(
      2998,
      -2,
    );
    // DEL -> BOM is about 612 nm.
    expect(distanceNm(28.5665, 77.1031, 19.0887, 72.8679)).toBeGreaterThan(590);
    expect(distanceNm(28.5665, 77.1031, 19.0887, 72.8679)).toBeLessThan(640);
  });

  it("is zero for the same point", () => {
    expect(distanceNm(22.3, 113.9, 22.3, 113.9)).toBeCloseTo(0, 5);
  });
});

describe("bearing and destPoint round-trip", () => {
  it("returns to the right distance and bearing", () => {
    const start = { lat: 22.5, lon: 114.0 };
    const b = 75;
    const d = 120;
    const p = destPoint(start.lat, start.lon, b, d);
    expect(distanceNm(start.lat, start.lon, p.lat, p.lon)).toBeCloseTo(d, 1);
    expect(bearingDeg(start.lat, start.lon, p.lat, p.lon)).toBeCloseTo(b, 0);
  });
});

describe("rangeRingPolygon", () => {
  it("places every vertex at the given radius and closes the ring", () => {
    const center = { lat: 22.47, lon: 113.86 };
    const ring = rangeRingPolygon(center.lat, center.lon, 50, 72);
    expect(ring.length).toBe(73); // steps + 1
    expect(ring[0]).toEqual(ring[ring.length - 1]); // closed
    for (const [lon, lat] of ring) {
      expect(distanceNm(center.lat, center.lon, lat, lon)).toBeCloseTo(50, 0);
    }
  });
});

describe("greatCirclePoints", () => {
  it("returns steps+1 points with matching endpoints", () => {
    const pts = greatCirclePoints(28.5665, 77.1031, 22.308, 113.918, 32);
    expect(pts.length).toBe(33);
    expect(pts[0]![0]).toBeCloseTo(77.1031, 3);
    expect(pts[0]![1]).toBeCloseTo(28.5665, 3);
    expect(pts[32]![0]).toBeCloseTo(113.918, 3);
    expect(pts[32]![1]).toBeCloseTo(22.308, 3);
  });
});
