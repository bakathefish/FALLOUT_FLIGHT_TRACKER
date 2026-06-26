import { z } from "zod";

// validates the server-only secrets at the env boundary (SPEC section 11).
// this is lazy and memoized: importing the module never parses, so `next build`
// with no env set does not crash at import time. we only parse on the first
// getServerEnv() call and cache the typed result. errors name exactly which
// vars are missing or invalid and never include their VALUES, so a misconfigured
// deploy fails loudly without leaking a passcode or connection string.

const serverEnvSchema = z.object({
  // supabase pooled connection, transaction mode, port 6543. used at runtime.
  DATABASE_URL: z.string().url(),
  // supabase direct connection, port 5432. only used for migrations.
  DIRECT_URL: z.string().url().optional(),
  // shared cohort passcode required to create an entry.
  WRITE_PASSCODE: z.string().min(1),
  // admin override to edit or remove any entry.
  ADMIN_PASSCODE: z.string().min(1),
});

/** the parsed, typed server env. */
export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * lazy, memoized access to the validated server env. parses process.env on the
 * first call and caches the typed result for every call after. throws a clear,
 * actionable error naming exactly which vars are missing or invalid (never their
 * values) so the fix is obvious. only call this from server code.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    // build the message from var name + zod's reason only. zod's messages here
    // ("Required", "Invalid url", ...) never echo the offending value, so no
    // secret ends up in the error or any log that prints it.
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `server env is missing or invalid: ${problems}. set these in your environment (see .env.example).`,
    );
  }

  cached = result.data;
  return cached;
}

/** test-only: drop the memoized env so the next getServerEnv() reparses. */
export function __resetEnvCache(): void {
  cached = undefined;
}
