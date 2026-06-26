import { describe, it, expect } from "vitest";
import {
  normalizeFlightNumber,
  callsignCandidates,
  buildCallsignIndex,
  matchAircraft,
  type MatchableAircraft,
} from "@/lib/callsign";

describe("normalizeFlightNumber", () => {
  it("uppercases and strips non-alphanumerics", () => {
    expect(normalizeFlightNumber("cx 216")).toBe("CX216");
    expect(normalizeFlightNumber("ua-1.2/3")).toBe("UA123");
  });
});

describe("callsignCandidates", () => {
  it("maps a 2-char prefix to the ICAO callsign", () => {
    const c = callsignCandidates("CX216");
    expect(c).toContain("CPA216");
    expect(c).toContain("CX216"); // raw normalized input always included
  });

  it("handles a digit-led 2-char prefix", () => {
    expect(callsignCandidates("6E123")).toContain("IGO123");
    expect(callsignCandidates("9C8888")).toContain("CQH8888");
  });

  it("emits both padded and stripped numbers for leading zeros", () => {
    const c = callsignCandidates("CX0216");
    expect(c).toContain("CPA0216");
    expect(c).toContain("CPA216");
  });

  it("uses the override as the only candidate when given", () => {
    expect(callsignCandidates("CX216", "CPA9")).toEqual(["CPA9"]);
    expect(callsignCandidates("CX216", "cpa 9")).toEqual(["CPA9"]);
  });

  it("passes a direct ICAO callsign through unchanged", () => {
    // CPA is not an IATA prefix, so no mapping; the raw input still matches.
    expect(callsignCandidates("CPA216")).toContain("CPA216");
  });

  it("does not map when the remainder is not a number", () => {
    // "CXABC" -> prefix CX maps, but remainder must start with a digit.
    const c = callsignCandidates("CXABC");
    expect(c).toEqual(["CXABC"]);
  });

  it("falls back to the raw input when no 2 or 3 char prefix matches", () => {
    // real IATA codes are 2 chars, so a 3-char prefix never maps; the raw
    // normalized callsign is still emitted so a direct ICAO entry matches.
    expect(callsignCandidates("ABC123")).toEqual(["ABC123"]);
  });
});

describe("matching against a feed", () => {
  const feed: MatchableAircraft[] = [
    { hex: "aaa", callsign: "CPA216 ", seenPos: 5 }, // trailing space on purpose
    { hex: "bbb", callsign: "UAL1", seenPos: 1 },
  ];

  it("resolves a flight number to the right aircraft", () => {
    const index = buildCallsignIndex(feed);
    expect(matchAircraft("CX216", null, index)?.hex).toBe("aaa");
  });

  it("returns null cleanly when nothing matches", () => {
    const index = buildCallsignIndex(feed);
    expect(matchAircraft("AI999", null, index)).toBeNull();
  });

  it("prefers the freshest position when callsigns collide", () => {
    const index = buildCallsignIndex([
      { hex: "stale", callsign: "CPA216", seenPos: 30 },
      { hex: "fresh", callsign: "CPA216", seenPos: 2 },
    ]);
    expect(matchAircraft("CX216", null, index)?.hex).toBe("fresh");
  });
});
