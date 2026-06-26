import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import type { ZodError } from "zod";
import { getServerEnv } from "./env";
import { checkWriteRateLimit } from "./rateLimit";

// small server-side helpers for the api routes: consistent json errors and
// constant-time secret comparison so passcodes do not leak via timing.

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function zodError(error: ZodError): NextResponse {
  return NextResponse.json(
    { error: "some fields did not validate", issues: error.flatten() },
    { status: 400 },
  );
}

/** constant-time string compare. false on length mismatch (cheaply). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** edit/delete auth: a matching edit token, or the admin passcode. */
export function isAuthorized(
  rowToken: string,
  editToken?: string,
  passcode?: string,
): boolean {
  if (editToken && constantTimeEqual(editToken, rowToken)) return true;
  // only validate env when an admin passcode is actually being tried, so the
  // edit-token path keeps working even if ADMIN_PASSCODE is unset.
  if (passcode) {
    const { ADMIN_PASSCODE } = getServerEnv();
    if (constantTimeEqual(passcode, ADMIN_PASSCODE)) return true;
  }
  return false;
}

/**
 * best-effort per-ip rate limit for writes. returns a 429 response when the
 * caller is over the window, else null so the handler proceeds.
 */
export function writeRateLimit(req: Request): NextResponse | null {
  const rl = checkWriteRateLimit(req);
  if (rl.ok) return null;
  return NextResponse.json(
    { error: "too many writes, slow down a sec" },
    { status: 429, headers: { "Retry-After": String(rl.retryAfterS) } },
  );
}
