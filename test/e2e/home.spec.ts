import { test, expect } from "@playwright/test";

// the feed is mocked (MOCK_ADSB=1) and there may be no database in this run, so
// the board can be empty; the map, airports, rings, and attribution must still
// render. that quiet state is accepted behavior (SPEC section 8).

test("home renders the hero map, header, and attribution with no errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /arrivals/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /add your flight/i }),
  ).toBeVisible();

  // the maplibre canvas mounts (component is dynamically imported, ssr off).
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
    timeout: 20_000,
  });

  // odbl attribution must be visible.
  await expect(page.getByRole("link", { name: /adsb\.lol/i })).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});

test("mobile viewport keeps the map and board usable", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile layout only");

  await page.goto("/");
  const canvas = page.locator("canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: /add your flight/i }),
  ).toBeVisible();

  // no horizontal overflow: the document is not wider than the viewport.
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
