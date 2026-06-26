import { describe, it, expect, beforeEach, vi } from "vitest";
import type { StateResponse } from "@/lib/apiState";
import type { Participant } from "@/lib/db/repo";

// the route handlers, with their deps mocked. real db crud is covered by
// repo.test.ts and the assembly by getState.test.ts; here we pin auth,
// validation, the cache header, and the response contract.

vi.mock("@/lib/getState", () => ({ getState: vi.fn() }));
vi.mock("@/lib/db/repo", () => ({
  createParticipant: vi.fn(),
  getParticipant: vi.fn(),
  updateParticipant: vi.fn(),
  deleteParticipant: vi.fn(),
}));

import { getState } from "@/lib/getState";
import {
  createParticipant,
  getParticipant,
  updateParticipant,
  deleteParticipant,
} from "@/lib/db/repo";
import { GET } from "@/app/api/state/route";
import { POST } from "@/app/api/participants/route";
import { PATCH, DELETE } from "@/app/api/participants/[id]/route";
import { __resetEnvCache } from "@/lib/env";
import { __resetRateLimit } from "@/lib/rateLimit";

// edit tokens are uuids in real life; the schema enforces that, so tests must
// use valid uuids or they 400 at validation before auth is ever checked.
const VALID_TOKEN = "11111111-1111-1111-1111-111111111111";
const WRONG_TOKEN = "22222222-2222-2222-2222-222222222222";
// route ids are uuids (the db default); the :id schema rejects non-uuids early.
const ROW_ID = "33333333-3333-3333-3333-333333333333";
const MISSING_ID = "44444444-4444-4444-4444-444444444444";

const row = (over: Partial<Participant> = {}): Participant =>
  ({
    id: "row-1",
    name: "Fish",
    flightNumber: "CX216",
    callsignOverride: null,
    originIata: null,
    originCity: null,
    destination: "HKG",
    arrivalDate: null,
    slackHandle: null,
    lastSeenAirborneAt: null,
    editToken: VALID_TOKEN,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as Participant;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
  process.env.WRITE_PASSCODE = "test-write";
  process.env.ADMIN_PASSCODE = "test-admin";
  __resetEnvCache();
  __resetRateLimit();
});

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/participants", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/state", () => {
  it("returns the payload with the edge cache header", async () => {
    const sample: StateResponse = {
      updatedAt: new Date().toISOString(),
      trafficInRange: 7,
      attribution: "data: adsb.lol (ODbL) and airplanes.live",
      airports: {
        HKG: {
          name: "Hong Kong Intl",
          icao: "VHHH",
          lat: 22.308,
          lon: 113.918,
        },
        SZX: {
          name: "Shenzhen Bao'an",
          icao: "ZGSZ",
          lat: 22.639,
          lon: 113.811,
        },
      },
      participants: [],
    };
    vi.mocked(getState).mockResolvedValue(sample);

    const res = await GET();
    expect(res.headers.get("cache-control")).toContain("s-maxage=8");
    expect(res.headers.get("cache-control")).toContain(
      "stale-while-revalidate=30",
    );
    const json = (await res.json()) as StateResponse;
    expect(json.airports.HKG.icao).toBe("VHHH");
    expect(json.trafficInRange).toBe(7);
  });
});

describe("POST /api/participants", () => {
  it("creates with the right passcode and returns an edit token", async () => {
    vi.mocked(createParticipant).mockResolvedValue(
      row({ id: "new-id", editToken: "new-token" }),
    );
    const res = await POST(
      postReq({
        passcode: "test-write",
        name: "Fish",
        flightNumber: "cx 216",
        destination: "HKG",
      }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; editToken: string };
    expect(json).toEqual({ id: "new-id", editToken: "new-token" });
    // flight number is normalized before it hits the db.
    expect(vi.mocked(createParticipant).mock.calls[0]?.[0].flightNumber).toBe(
      "CX216",
    );
  });

  it("rejects a wrong passcode with 403 and never touches the db", async () => {
    const res = await POST(
      postReq({
        passcode: "nope",
        name: "Fish",
        flightNumber: "CX216",
        destination: "HKG",
      }),
    );
    expect(res.status).toBe(403);
    expect(createParticipant).not.toHaveBeenCalled();
  });

  it("rejects invalid input with 400", async () => {
    const res = await POST(
      postReq({
        passcode: "test-write",
        name: "Fish",
        flightNumber: "C",
        destination: "HKG",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-json body with 400", async () => {
    const res = await POST(
      new Request("http://localhost/api/participants", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/participants/:id", () => {
  it("edits via the edit-token path", async () => {
    vi.mocked(getParticipant).mockResolvedValue(row());
    vi.mocked(updateParticipant).mockResolvedValue(row({ name: "Fishy" }));
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ name: "Fishy", editToken: VALID_TOKEN }),
      }),
      ctx(ROW_ID),
    );
    expect(res.status).toBe(200);
    expect(updateParticipant).toHaveBeenCalledOnce();
  });

  it("edits via the admin passcode path", async () => {
    vi.mocked(getParticipant).mockResolvedValue(row());
    vi.mocked(updateParticipant).mockResolvedValue(row());
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ name: "Fishy", passcode: "test-admin" }),
      }),
      ctx(ROW_ID),
    );
    expect(res.status).toBe(200);
  });

  it("rejects a wrong token with 403", async () => {
    vi.mocked(getParticipant).mockResolvedValue(row());
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ name: "Fishy", editToken: WRONG_TOKEN }),
      }),
      ctx(ROW_ID),
    );
    expect(res.status).toBe(403);
    expect(updateParticipant).not.toHaveBeenCalled();
  });

  it("404s an unknown id", async () => {
    vi.mocked(getParticipant).mockResolvedValue(null);
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ name: "Fishy", editToken: VALID_TOKEN }),
      }),
      ctx(MISSING_ID),
    );
    expect(res.status).toBe(404);
  });

  it("404s a malformed (non-uuid) id without touching the db", async () => {
    const res = await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        body: JSON.stringify({ name: "Fishy", editToken: VALID_TOKEN }),
      }),
      ctx("not-a-uuid"),
    );
    expect(res.status).toBe(404);
    expect(getParticipant).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/participants/:id", () => {
  it("removes via the edit-token path", async () => {
    vi.mocked(getParticipant).mockResolvedValue(row());
    vi.mocked(deleteParticipant).mockResolvedValue(true);
    const res = await DELETE(
      new Request("http://localhost/x", {
        method: "DELETE",
        body: JSON.stringify({ editToken: VALID_TOKEN }),
      }),
      ctx(ROW_ID),
    );
    expect(res.status).toBe(200);
    expect(deleteParticipant).toHaveBeenCalledOnce();
  });

  it("removes via the admin passcode path", async () => {
    vi.mocked(getParticipant).mockResolvedValue(row());
    vi.mocked(deleteParticipant).mockResolvedValue(true);
    const res = await DELETE(
      new Request("http://localhost/x", {
        method: "DELETE",
        body: JSON.stringify({ passcode: "test-admin" }),
      }),
      ctx(ROW_ID),
    );
    expect(res.status).toBe(200);
    expect(deleteParticipant).toHaveBeenCalledOnce();
  });

  it("rejects a wrong token with 403 and never deletes", async () => {
    vi.mocked(getParticipant).mockResolvedValue(row());
    const res = await DELETE(
      new Request("http://localhost/x", {
        method: "DELETE",
        body: JSON.stringify({ editToken: WRONG_TOKEN }),
      }),
      ctx(ROW_ID),
    );
    expect(res.status).toBe(403);
    expect(deleteParticipant).not.toHaveBeenCalled();
  });

  it("404s an unknown id", async () => {
    vi.mocked(getParticipant).mockResolvedValue(null);
    const res = await DELETE(
      new Request("http://localhost/x", {
        method: "DELETE",
        body: JSON.stringify({ passcode: "test-admin" }),
      }),
      ctx(MISSING_ID),
    );
    expect(res.status).toBe(404);
  });

  it("400s when no auth is supplied", async () => {
    const res = await DELETE(
      new Request("http://localhost/x", {
        method: "DELETE",
        body: JSON.stringify({}),
      }),
      ctx(ROW_ID),
    );
    expect(res.status).toBe(400);
  });
});
