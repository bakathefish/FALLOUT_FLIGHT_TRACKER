import { asc, eq, inArray } from "drizzle-orm";
import type { ParticipantInput } from "@/lib/schema";
import { getDb, type DB } from "./client";
import { participants, type Participant } from "./schema";

// repo is the only sanctioned door to the db, so callers that need the types
// (getState, route handlers) get them from here, not from the client directly.
export type { DB } from "./client";
export type { Participant } from "./schema";

// the whole database surface. every function takes an optional trailing db so
// tests can inject a pglite-backed handle and production callers omit it and
// get the pooled connection. no sql lives anywhere else (SPEC section 2).

/** insert a participant and return the full row, including id and editToken. */
export async function createParticipant(
  input: ParticipantInput,
  db: DB = getDb(),
): Promise<Participant> {
  const rows = await db.insert(participants).values(input).returning();
  const row = rows[0];
  if (!row) {
    // insert ... returning always yields the row. guard keeps the type honest.
    throw new Error("createParticipant: insert returned no row");
  }
  return row;
}

/** all participants, oldest first. */
export async function listParticipants(
  db: DB = getDb(),
): Promise<Participant[]> {
  return db.select().from(participants).orderBy(asc(participants.createdAt));
}

/** one participant by id, or null if there is no such row. */
export async function getParticipant(
  id: string,
  db: DB = getDb(),
): Promise<Participant | null> {
  const rows = await db
    .select()
    .from(participants)
    .where(eq(participants.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * update the provided fields and always bump updatedAt to now. returns the
 * updated row, or null when the id does not exist.
 */
export async function updateParticipant(
  id: string,
  fields: Partial<ParticipantInput>,
  db: DB = getDb(),
): Promise<Participant | null> {
  const rows = await db
    .update(participants)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(participants.id, id))
    .returning();
  return rows[0] ?? null;
}

/** remove a participant. true when a row was actually deleted. */
export async function deleteParticipant(
  id: string,
  db: DB = getDb(),
): Promise<boolean> {
  const rows = await db
    .delete(participants)
    .where(eq(participants.id, id))
    .returning({ id: participants.id });
  return rows.length > 0;
}

/**
 * stamp last_seen_airborne_at for the given ids. no-op on an empty list so we
 * never build a degenerate `in ()` query.
 */
export async function touchLastSeenAirborne(
  ids: string[],
  at: Date,
  db: DB = getDb(),
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(participants)
    .set({ lastSeenAirborneAt: at })
    .where(inArray(participants.id, ids));
}
