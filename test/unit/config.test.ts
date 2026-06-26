import { describe, it, expect } from "vitest";
import {
  AIRPORTS,
  DESTINATIONS,
  resolveCenters,
  DEFAULT_CENTERS,
  GROUND_ALT_THRESHOLD_FT,
} from "@/lib/config";

describe("config", () => {
  it("knows HKG and SZX with sane coordinates", () => {
    expect(DESTINATIONS).toEqual(["HKG", "SZX"]);
    expect(AIRPORTS.HKG.icao).toBe("VHHH");
    expect(AIRPORTS.SZX.icao).toBe("ZGSZ");
    for (const dest of DESTINATIONS) {
      const a = AIRPORTS[dest];
      expect(a.lat).toBeGreaterThan(22);
      expect(a.lat).toBeLessThan(23);
      expect(a.lon).toBeGreaterThan(113);
      expect(a.lon).toBeLessThan(114);
      expect(a.tz).toMatch(/^Asia\//);
    }
  });

  it("uses the PRD bubble by default and ignores junk overrides", () => {
    expect(resolveCenters(undefined)).toEqual(DEFAULT_CENTERS);
    expect(resolveCenters("not json")).toEqual(DEFAULT_CENTERS);
    expect(resolveCenters("[[1,2]]")).toEqual(DEFAULT_CENTERS);
    expect(resolveCenters("[[10, 20, 250]]")).toEqual([[10, 20, 250]]);
  });

  it("has a ground threshold of 75 ft", () => {
    expect(GROUND_ALT_THRESHOLD_FT).toBe(75);
  });
});
