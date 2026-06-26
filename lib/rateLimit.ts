// best-effort per-ip fixed-window limiter for the write routes. it lives in
// module memory, so under serverless scale-out each instance keeps its own
// window: this is a speed bump against a single abuser, not a hard guarantee.
// the shared passcode is the real gate (SPEC section 6). for a strict limit,
// swap this for Upstash Ratelimit (the documented production upgrade).

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;

const hits = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: Request): string {
  // prefer x-real-ip: the platform (vercel) sets it to the real peer and the
  // client cannot forge it. x-forwarded-for is client-controlled (its left-most
  // entry is whatever the caller sent), so it is only a best-effort fallback
  // for non-vercel hosts. rotating a spoofed xff must not buy a fresh window.
  const real = req.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0];
    if (first && first.trim()) return first.trim();
  }
  return "unknown";
}

export interface RateResult {
  ok: boolean;
  retryAfterS: number;
}

export function checkWriteRateLimit(
  req: Request,
  now = Date.now(),
): RateResult {
  const ip = clientIp(req);
  const entry = hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterS: 0 };
  }
  if (entry.count >= MAX_PER_WINDOW) {
    return { ok: false, retryAfterS: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true, retryAfterS: 0 };
}

/** test-only: clear the window state. */
export function __resetRateLimit(): void {
  hits.clear();
}
