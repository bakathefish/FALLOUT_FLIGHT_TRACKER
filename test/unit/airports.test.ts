import { describe, it, expect } from "vitest";
import { lookupAirport, airportCount } from "@/lib/airports";

describe("airport lookup", () => {
  it("resolves a known IATA to coordinates and a city", () => {
    const del = lookupAirport("DEL");
    expect(del).not.toBeNull();
    expect(del?.city).toMatch(/delhi/i);
    expect(del?.lat).toBeGreaterThan(28);
    expect(del?.lat).toBeLessThan(29);
    expect(del?.icao).toBe("VIDP");
  });

  it("is case-insensitive and trims", () => {
    expect(lookupAirport(" del ")?.iata).toBe("DEL");
  });

  it("returns null for unknown or empty input without throwing", () => {
    expect(lookupAirport("ZZZ")).toBeNull();
    expect(lookupAirport(null)).toBeNull();
    expect(lookupAirport(undefined)).toBeNull();
    expect(lookupAirport("")).toBeNull();
  });

  it("bundles a substantial dataset", () => {
    expect(airportCount()).toBeGreaterThan(5000);
  });
});
