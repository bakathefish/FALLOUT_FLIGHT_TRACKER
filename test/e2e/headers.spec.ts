import { test, expect } from "@playwright/test";

// the security headers are set in next.config for every route. e2e runs against
// the production build, so the full policy (including the csp) is in force. this
// proves the headers reach the browser and that the enforced csp does not break
// the maplibre map (worker from blob, glyphs over connect-src).

test("the document carries the hardening headers", async ({ page }) => {
  const res = await page.goto("/");
  expect(res, "no response for /").not.toBeNull();
  const h = res!.headers();

  const csp = h["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("https://api.maptiler.com");

  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["permissions-policy"]).toContain("geolocation=()");
});

test("the map still renders under the enforced csp", async ({ page }) => {
  const cspViolations: string[] = [];
  page.on("console", (msg) => {
    if (msg.text().toLowerCase().includes("content security policy")) {
      cspViolations.push(msg.text());
    }
  });

  await page.goto("/");
  // if the csp blocked the maplibre worker or glyph fetch, the canvas would not
  // mount.
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
    timeout: 20_000,
  });
  expect(cspViolations, cspViolations.join("\n")).toEqual([]);
});
