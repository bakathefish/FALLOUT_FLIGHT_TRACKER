import { test, expect } from "@playwright/test";

// drive the UI from a crafted /api/state so we can assert the airborne path
// (board "in air" row + the map staying healthy) without needing a database.
// this is the client poll; the server's first paint may be empty, then this
// payload arrives and the board fills in.

const craftedState = {
  updatedAt: "2026-07-01T06:00:00.000Z",
  trafficInRange: 1,
  attribution: "data: adsb.lol (ODbL) and airplanes.live",
  airports: {
    HKG: { name: "Hong Kong Intl", icao: "VHHH", lat: 22.308, lon: 113.918 },
    SZX: { name: "Shenzhen Bao'an", icao: "ZGSZ", lat: 22.639, lon: 113.811 },
  },
  participants: [
    {
      id: "e2e-air-1",
      name: "Radar Tester",
      slackHandle: "@radar",
      flightNumber: "CX216",
      destination: "HKG",
      arrivalDate: "2026-07-01",
      origin: { iata: "DEL", city: "Delhi", lat: 28.5556, lon: 77.0952 },
      status: "air",
      live: {
        callsign: "CPA216",
        lat: 23.4,
        lon: 112.1,
        track: 130,
        altFt: 35000,
        groundSpeedKt: 451,
        aircraftType: "B789",
        registration: "B-LXA",
        distToDestNm: 180,
        etaMinutes: 24,
        etaLocal: "14:24",
      },
    },
  ],
};

test("an airborne participant shows up in air on the board", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.route("**/api/state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(craftedState),
    });
  });

  await page.goto("/");

  await expect(page.getByText("Radar Tester")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("CX216").first()).toBeVisible();
  await expect(page.getByText(/in air/i).first()).toBeVisible();

  // the hero canvas stays healthy while drawing the dot + route line.
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});
