// security response headers for every route (see the launch-readiness spec).
// the policy is enforced and pragmatic: lock down the high-value stuff
// (framing, plugin embedding, base-uri, no eval, a tight connect/img allowlist)
// and accept 'unsafe-inline' for scripts and styles. that tradeoff is
// deliberate. next injects inline bootstrap scripts with no nonce, maplibre and
// react set inline styles, and the app has zero script-injection sinks (no
// dangerouslySetInnerHTML, no eval), so inline is low risk here. nonce-based
// csp was considered and set aside as over-engineering for this app.

// the only origins the BROWSER reaches are maptiler (style, vector tiles,
// glyphs, sprite) and demotiles (glyph fallback). the adsb feeds are called
// server-side only, so they are intentionally absent from connect-src.
const MAPTILER = "https://api.maptiler.com";
const DEMOTILES = "https://demotiles.maplibre.org";

// ordered so the serialized policy reads broad to specific. a null value is a
// valueless directive (e.g. upgrade-insecure-requests).
const CSP: Record<string, string[] | null> = {
  "default-src": ["'self'"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:", MAPTILER],
  "font-src": ["'self'"],
  "connect-src": ["'self'", MAPTILER, DEMOTILES],
  // maplibre builds its web worker from a blob url; child-src is the fallback
  // for older browsers that do not honor worker-src.
  "worker-src": ["'self'", "blob:"],
  "child-src": ["blob:"],
  "manifest-src": ["'self'"],
  // force https for any stray http subresource.
  "upgrade-insecure-requests": null,
};

/** the content-security-policy string. pure, so it is easy to unit test. */
export function buildCsp(): string {
  return Object.entries(CSP)
    .map(([name, values]) => (values ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}

// turn off browser features the app never uses, so a future bug or a
// compromised dependency cannot quietly switch them on.
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=(self)",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "picture-in-picture=()",
  "usb=()",
].join(", ");

/** the full security header list, applied to every route in next.config. */
export function securityHeaders(): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp() },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  ];
}
