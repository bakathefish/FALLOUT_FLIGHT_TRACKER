import { test, expect } from "@playwright/test";

// with reduced motion the map must skip dead-reckoning + dash animation but
// still render and place dots. assert it mounts cleanly with no errors.
test.use({ reducedMotion: "reduce" });

test("prefers-reduced-motion: map still renders, no animation errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");

  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: /arrivals/i })).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});
