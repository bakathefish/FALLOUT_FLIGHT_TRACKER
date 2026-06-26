import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import {
  createParticipant,
  deleteParticipant,
  getParticipant,
  listParticipants,
  touchLastSeenAirborne,
  updateParticipant,
} from "@/lib/db/repo";
import type { Destination } from "@/lib/config";
import type { ParticipantInput } from "@/lib/schema";

// in-memory postgres (real pg under wasm) with the actual generated migrations
// applied. never touches a remote database. the repo functions are typed for
// postgres.js, so we bridge the driver type for tests only, never with `any`.
const client = new PGlite();
const pglite = drizzle(client, { schema });
const db = pglite as unknown as DB;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_ID = "00000000-0000-0000-0000-000000000000";

const base: ParticipantInput = {
  name: "Fish",
  flightNumber: "CX216",
  destination: "HKG",
  originIata: "DEL",
  originCity: "Delhi",
  arrivalDate: "2026-07-01",
  slackHandle: "@fish",
};

beforeAll(async () => {
  await migrate(pglite, { migrationsFolder: "drizzle" });
});

beforeEach(async () => {
  // fresh slate each test so rows never bleed across cases.
  await pglite.delete(schema.participants);
});

describe("participants repo", () => {
  it("creates a row with uuid id and editToken that then persists", async () => {
    const row = await createParticipant(base, db);
    expect(row.id).toMatch(UUID_RE);
    expect(row.editToken).toMatch(UUID_RE);
    // brand new rows have not been seen airborne yet.
    expect(row.lastSeenAirborneAt).toBeNull();

    const found = await getParticipant(row.id, db);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(row.id);
    expect(found?.name).toBe("Fish");
  });

  it("stores the fields, and the destination check rejects bad values", async () => {
    const row = await createParticipant(
      { ...base, destination: "SZX", originIata: "BOM", originCity: "Mumbai" },
      db,
    );
    expect(row.destination).toBe("SZX");
    expect(row.flightNumber).toBe("CX216");
    expect(row.originIata).toBe("BOM");
    expect(row.originCity).toBe("Mumbai");
    expect(row.arrivalDate).toBe("2026-07-01");
    expect(row.slackHandle).toBe("@fish");

    // the db check guards destination even when the zod enum is bypassed.
    await expect(
      createParticipant({ ...base, destination: "LHR" as Destination }, db),
    ).rejects.toThrow();
  });

  it("lists inserted rows oldest first", async () => {
    const a = await createParticipant({ ...base, name: "A" }, db);
    const b = await createParticipant({ ...base, name: "B" }, db);

    const rows = await listParticipants(db);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    // created_at is non-decreasing, i.e. genuinely oldest first.
    const times = rows.map((r) => r.createdAt.getTime());
    expect(times).toEqual([...times].sort((x, y) => x - y));
  });

  it("returns null for an unknown id", async () => {
    expect(await getParticipant(MISSING_ID, db)).toBeNull();
  });

  it("updates a field and bumps updatedAt, null on unknown id", async () => {
    const row = await createParticipant(base, db);

    const updated = await updateParticipant(
      row.id,
      { name: "Fish 2", originCity: "Gurgaon" },
      db,
    );
    expect(updated).not.toBeNull();
    if (!updated) throw new Error("expected an updated row");
    expect(updated.id).toBe(row.id);
    expect(updated.name).toBe("Fish 2");
    expect(updated.originCity).toBe("Gurgaon");
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      updated.createdAt.getTime(),
    );

    expect(
      await updateParticipant(MISSING_ID, { name: "ghost" }, db),
    ).toBeNull();
  });

  it("deletes a row and reports unknown ids", async () => {
    const row = await createParticipant(base, db);

    expect(await deleteParticipant(row.id, db)).toBe(true);
    expect(await getParticipant(row.id, db)).toBeNull();

    expect(await deleteParticipant(MISSING_ID, db)).toBe(false);
  });

  it("stamps last_seen_airborne_at only for the given ids", async () => {
    const a = await createParticipant({ ...base, name: "A" }, db);
    const b = await createParticipant({ ...base, name: "B" }, db);
    expect(a.lastSeenAirborneAt).toBeNull();

    // empty list is a no-op and must not throw.
    await touchLastSeenAirborne([], new Date(), db);

    const at = new Date("2026-06-26T08:00:00.000Z");
    await touchLastSeenAirborne([a.id], at, db);

    const afterA = await getParticipant(a.id, db);
    const afterB = await getParticipant(b.id, db);
    if (!afterA || !afterB) throw new Error("expected both rows to exist");

    const seen = afterA.lastSeenAirborneAt;
    expect(seen).not.toBeNull();
    if (!seen) throw new Error("expected a last_seen timestamp");
    expect(seen.getTime()).toBe(at.getTime());

    // the untouched row stays null.
    expect(afterB.lastSeenAirborneAt).toBeNull();
  });
});
