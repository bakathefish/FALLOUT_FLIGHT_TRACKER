import { describe, it, expect } from "vitest";
import { buildCsp, securityHeaders } from "@/lib/securityHeaders";

// the csp has to be tight but still let the maplibre map work. these tests pin
// both halves: what we lock down, and the few origins the browser genuinely
// needs (maptiler style/tiles/glyphs/sprite, demotiles glyph fallback). the
// adsb feeds are server-side only and must never be reachable from the browser.

describe("buildCsp", () => {
  const directives = () =>
    buildCsp()
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean);

  const directive = (name: string) =>
    directives().find((d) => d === name || d.startsWith(name + " "));

  it("defaults every fetch directive to self", () => {
    expect(directive("default-src")).toBe("default-src 'self'");
  });

  it("locks down framing, plugin embedding, and base-uri", () => {
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
  });

  it("allows only the map origins the browser actually calls", () => {
    const connect = directive("connect-src") ?? "";
    expect(connect).toContain("'self'");
    expect(connect).toContain("https://api.maptiler.com");
    expect(connect).toContain("https://demotiles.maplibre.org");
    expect(connect).not.toContain("adsb.lol");
    expect(connect).not.toContain("airplanes.live");
  });

  it("lets maplibre build its worker from a blob", () => {
    expect(directive("worker-src") ?? "").toContain("blob:");
  });

  it("lets maplibre decode tile images from data and blob and maptiler", () => {
    const img = directive("img-src") ?? "";
    expect(img).toContain("data:");
    expect(img).toContain("blob:");
    expect(img).toContain("https://api.maptiler.com");
  });

  it("never allows eval", () => {
    expect(buildCsp()).not.toContain("'unsafe-eval'");
  });
});

describe("securityHeaders", () => {
  const find = (key: string) =>
    securityHeaders().find((h) => h.key.toLowerCase() === key.toLowerCase());

  it("carries the csp from buildCsp", () => {
    expect(find("Content-Security-Policy")?.value).toBe(buildCsp());
  });

  it("turns on hsts for a long window including subdomains", () => {
    const hsts = find("Strict-Transport-Security")?.value ?? "";
    expect(hsts).toMatch(/max-age=\d{7,}/);
    expect(hsts).toContain("includeSubDomains");
  });

  it("denies framing with x-frame-options", () => {
    expect(find("X-Frame-Options")?.value).toBe("DENY");
  });

  it("forbids mime sniffing", () => {
    expect(find("X-Content-Type-Options")?.value).toBe("nosniff");
  });

  it("sends a privacy-preserving referrer policy", () => {
    expect(find("Referrer-Policy")?.value).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("disables powerful browser features the app does not use", () => {
    const pp = find("Permissions-Policy")?.value ?? "";
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
  });
});
