import { describe, it, expect, beforeEach } from "vitest";
import {
  clientIp,
  checkWriteRateLimit,
  __resetRateLimit,
} from "@/lib/rateLimit";

// the limiter is best-effort (see lib/rateLimit.ts); these pin the ip source
// and the window math so a spoofed x-forwarded-for cannot buy a fresh window.

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/participants", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  __resetRateLimit();
});

describe("clientIp", () => {
  it("prefers x-real-ip over the spoofable x-forwarded-for", () => {
    const ip = clientIp(
      req({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.2.3.4" }),
    );
    expect(ip).toBe("9.9.9.9");
  });

  it("falls back to the first x-forwarded-for hop when x-real-ip is absent", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe(
      "1.2.3.4",
    );
  });

  it("is 'unknown' when neither header is present", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("checkWriteRateLimit", () => {
  it("allows up to the cap, then 429s, keyed per ip", () => {
    const a = req({ "x-real-ip": "10.0.0.1" });
    let last = { ok: true, retryAfterS: 0 };
    for (let i = 0; i < 40; i++) last = checkWriteRateLimit(a);
    expect(last.ok).toBe(true);

    const over = checkWriteRateLimit(a);
    expect(over.ok).toBe(false);
    expect(over.retryAfterS).toBeGreaterThan(0);

    // a different ip has its own window.
    expect(checkWriteRateLimit(req({ "x-real-ip": "10.0.0.2" })).ok).toBe(true);
  });

  it("resets once the window elapses", () => {
    const a = req({ "x-real-ip": "10.0.0.3" });
    const t0 = 1_000_000;
    for (let i = 0; i < 40; i++) checkWriteRateLimit(a, t0);
    expect(checkWriteRateLimit(a, t0).ok).toBe(false);
    expect(checkWriteRateLimit(a, t0 + 60_000).ok).toBe(true);
  });
});
