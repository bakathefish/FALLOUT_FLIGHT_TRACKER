import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

// the only file that touches the database driver. everything else goes through
// lib/db/repo.ts so the vendor stays swappable (SPEC section 2).
export type DB = PostgresJsDatabase<typeof schema>;

let cached: DB | undefined;

/**
 * lazy, memoized handle on the pooled runtime connection. nothing opens at
 * import time. we connect through Supabase's transaction pooler (port 6543),
 * which means prepared statements must be off, hence { prepare: false }
 * (SPEC section 2). we never log the url.
 */
export function getDb(): DB {
  if (cached) return cached;

  // env is validated with zod at this boundary (see lib/env.ts).
  const { DATABASE_URL } = getServerEnv();

  const client = postgres(DATABASE_URL, {
    // transaction pooler (port 6543) does not support prepared statements.
    prepare: false,
    // serverless: keep each instance's pool tiny so many warm instances do not
    // exhaust the pooler, and release idle connections quickly.
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  cached = drizzle(client, { schema });
  return cached;
}
