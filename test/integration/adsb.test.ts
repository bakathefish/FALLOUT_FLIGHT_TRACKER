import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getAircraft, __clearAdsbCache, ADSB_ATTRIBUTION } from "@/lib/adsb";
import { buildCallsignIndex, matchAircraft } from "@/lib/callsign";
import type { FeedCenter } from "@/lib/config";
import fixture from "@/test/fixtures/adsb-prd.json";

// no real network ever. fetch is stubbed and the upstream body comes from the
// recorded fixture. see SPEC sections 2 and 3.

const EXPECTED_UA = "fallout-arrivals/1.0 (hack club cohort flight board)";

/** a 200 response carrying the recorded feed body. */
function okResponse(): Response {
  return new Response(JSON.stringify(fixture), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  __clearAdsbCache();
  // exercise the real network path (mocked), not MOCK_ADSB mode.
  process.env.MOCK_ADSB = "0";
  // keep the default PRD bubble deterministic.
  delete process.env.ADSB_CENTERS;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getAircraft", () => {
  it("normalizes the fixture and matches CX216 to CPA216", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const snap = await getAircraft();

    expect(snap.source).toBe("adsb.lol");
    expect(ADSB_ATTRIBUTION).toContain("adsb.lol");

    const cpa = snap.aircraft.find((a) => a.callsign === "CPA216");
    expect(cpa).toBeDefined();
    // raw "CPA216  " is trimmed and uppercased.
    expect(cpa?.callsign).toBe("CPA216");
    expect(cpa?.hex).toBe("a1b2c3");
    expect(cpa?.altBaro).toBe(35000);
    expect(cpa?.registration).toBe("B-LXA");
    expect(cpa?.aircraftType).toBe("B789");
    expect(cpa?.lat).toBeCloseTo(24.12, 5);
    expect(cpa?.lon).toBeCloseTo(110.85, 5);
    expect(cpa?.groundSpeedKt).toBe(451);

    // integrates with the callsign matcher: CX216 -> CPA216.
    const index = buildCallsignIndex(snap.aircraft);
    const match = matchAircraft("CX216", null, index);
    expect(match?.hex).toBe("a1b2c3");
  });

  it("normalizes the on-ground aircraft with alt_baro 'ground'", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const snap = await getAircraft();
    const grounded = snap.aircraft.find((a) => a.callsign === "CPA904");
    expect(grounded?.altBaro).toBe("ground");
  });

  it("caches within the window: one fetch per center", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await getAircraft();
    await getAircraft();

    // default centers is a single PRD bubble, so two calls share one fetch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to airplanes.live when adsb.lol rejects, sending the User-Agent", async () => {
    let liveInit: RequestInit | undefined;
    const fetchMock = vi.fn(
      async (url: string | URL, init?: RequestInit): Promise<Response> => {
        if (String(url).includes("adsb.lol")) {
          throw new Error("network down");
        }
        // record the airplanes.live request so we can check its header.
        liveInit = init;
        return okResponse();
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const snap = await getAircraft();

    expect(snap.source).toBe("airplanes.live");
    // it parses the same fixture.
    expect(snap.aircraft.some((a) => a.callsign === "CPA216")).toBe(true);
    expect(snap.trafficInRange).toBe(fixture.ac.length);

    // the airplanes.live request carried a descriptive User-Agent.
    const headers = new Headers(liveInit?.headers);
    expect(headers.get("User-Agent")).toBe(EXPECTED_UA);
  });

  it("falls back to airplanes.live when adsb.lol returns a non-200", async () => {
    const fetchMock = vi.fn(async (url: string | URL): Promise<Response> => {
      if (String(url).includes("adsb.lol")) {
        return new Response("backoff", { status: 429 });
      }
      return okResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const snap = await getAircraft();
    expect(snap.source).toBe("airplanes.live");
    expect(snap.aircraft.some((a) => a.callsign === "CPA216")).toBe(true);
  });

  it("returns 'none' with no aircraft when both feeds are down, without throwing", async () => {
    const fetchMock = vi.fn(async () => new Response("error", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const snap = await getAircraft();
    expect(snap.source).toBe("none");
    expect(snap.aircraft).toEqual([]);
    expect(snap.trafficInRange).toBe(0);
  });

  it("trafficInRange equals the deduped aircraft count across centers", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    // two identical centers return the fixture twice; dedupe by hex collapses
    // the 12 rows back to the 6 unique aircraft.
    const centers: FeedCenter[] = [
      [22.47, 113.86, 250],
      [22.47, 113.86, 250],
    ];
    const snap = await getAircraft(centers);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snap.trafficInRange).toBe(fixture.ac.length);
    expect(snap.trafficInRange).toBe(snap.aircraft.length);
  });

  it("passes an abort signal so a hung upstream cannot stall the render", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    await getAircraft();

    const [, init] = (fetchMock.mock.calls[0] ?? []) as unknown as [
      unknown,
      RequestInit?,
    ];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
