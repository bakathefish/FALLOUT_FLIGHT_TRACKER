import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";
import {
  createParticipant,
  getParticipant,
  touchLastSeenAirborne,
  type DB,
} from "@/lib/db/repo";
import type { ParticipantInput } from "@/lib/schema";
import { getState } from "@/lib/getState";
import { __clearAdsbCache } from "@/lib/adsb";

let db: DB;

beforeEach(async () => {
  const client = new PGlite();
  const d = drizzle(client, { schema });
  await migrate(d, { migrationsFolder: "drizzle" });
  db = d as unknown as DB;
  __clearAdsbCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MOCK_ADSB;
});

const fish: ParticipantInput = {
  name: "Fish",
  flightNumber: "CX216",
  destination: "HKG",
  originIata: "DEL",
  originCity: "Delhi",
};

describe("getState with the mock feed", () => {
  it("matches a seeded flight, emits live, resolves origin, stamps last_seen", async () => {
    process.env.MOCK_ADSB = "1";
    const created = await createParticipant(fish, db);

    const state = await getState({ db });

    expect(state.airports.HKG.icao).toBe("VHHH");
    expect(state.attribution).toContain("adsb.lol");

    const me = state.participants.find((p) => p.id === created.id);
    expect(me).toBeDefined();
    expect(me?.status).toBe("air");
    expect(me?.live?.callsign).toBe("CPA216");
    expect(me?.live?.altFt).toBe(35000);
    expect(me?.origin?.iata).toBe("DEL");

    // airborne observation should be persisted for landed-detection later.
    const row = await getParticipant(created.id, db);
    expect(row?.lastSeenAirborneAt).not.toBeNull();
  });
});

describe("getState when both feeds are down", () => {
  it("still returns participants, just with no live data and no throw", async () => {
    process.env.MOCK_ADSB = "0";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("feed unreachable")),
    );
    const created = await createParticipant(fish, db);

    const state = await getState({ db });

    expect(state.trafficInRange).toBe(0);
    const me = state.participants.find((p) => p.id === created.id);
    expect(me?.live).toBeNull();
    expect(me?.status).toBe("expected");
  });
});

describe("getState landed from memory", () => {
  it("marks a vanished but recently airborne flight as landed", async () => {
    process.env.MOCK_ADSB = "0";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ac: [] }),
      }),
    );
    const created = await createParticipant(
      {
        name: "Gone",
        flightNumber: "AI999",
        destination: "HKG",
        arrivalDate: "2020-01-01",
      },
      db,
    );
    // last seen airborne an hour ago, now gone from the feed -> it came down.
    await touchLastSeenAirborne(
      [created.id],
      new Date(Date.now() - 60 * 60 * 1000),
      db,
    );

    const state = await getState({ db });

    const me = state.participants.find((p) => p.id === created.id);
    expect(me?.status).toBe("landed");
    expect(me?.live).toBeNull();
  });
});
