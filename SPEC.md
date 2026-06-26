# Fallout Arrivals — Project Spec

A live web board where the Hack Club Fallout cohort watches each other's flights converge on Shenzhen and Hong Kong in real time. The live map is the hero. Everything else supports it.

This document is the single source of truth. Build the whole thing from this file, complete, with tests and docs. No workarounds where the real fix is reachable.

---

## 1. What we are building

People in the Fallout cohort (~100 people) open a link shared in their cohort chat. They see a dark flight-ops map with planes crawling toward HKG and SZX, each plane is a real cohort member's flight pulled live from ADS-B. Around the map: an arrivals board (who has landed, who is in the air, who has not taken off), a counter, and a way to find your own flight and who is on it. Anyone with the link can view. Adding or editing an entry is gated by a shared passcode that lives in the cohort chat.

The feeling we are going for: open it on landing day and watch the cohort's dots pile up on the Pearl River Delta.

### Locked product decisions (do not relitigate)

- Audience: Fallout cohort, around 100 people.
- Access: public to view (no login to look), realistically shared only in the cohort chat.
- Submission: everyone self-submits their own flight through a form on the site. Stored in a real database.
- Form fields: name, flight number, origin airport code, origin city (free text), destination (HKG or SZX, dropdown), arrival date, slack handle (plain text).
- Hero: the live map. Airborne people only show as moving dots. Each has a route line. The map is framed on the HKG/SZX funnel by default but is fully pannable and zoomable so you can chase a dot back to Delhi or London.
- Support pieces: arrivals board (landed / in air / expected), cohort counter, find-your-flight.
- Off-air people (not departed, or already landed) do not get a dot on the map. They live in the board only. The map will sometimes be quiet (early morning, late night). That is accepted behavior. The map must still show airports and range rings so it never looks broken, and the board and counter carry those windows.
- Data source: adsb.lol primary, airplanes.live fallback. Flight number to callsign to live position. Already tested working from this environment.

---

## 2. Architecture overview

```
                 browser (public, ~100 viewers)
        MapLibre GL map  +  arrivals board  +  add-flight form
                          |  polls every ~15s
                          v
            Next.js (App Router, TypeScript) on Vercel
   /api/state            -> combined live payload (cached ~8s at the edge)
   /api/participants     -> create (POST)
   /api/participants/:id -> edit (PATCH), remove (DELETE)
                |                         |
                | server-side fetch        | typed queries (Drizzle)
                | cached ~10s, 1 caller     v
                v                    Supabase (Postgres)
        adsb.lol  (primary)         participants table
        airplanes.live (fallback)
```

Key idea: the ADS-B feed is only ever called from the server, once per cache window, no matter how many people are watching. This keeps us polite to the free feeds and well under their limits. Browsers never call adsb.lol directly.

### Recommended stack

- Framework: Next.js 15 App Router + TypeScript (strict). Reason: it co-locates the frontend and the serverless API routes, and its route/data caching is exactly the mechanism that lets 100 viewers share one upstream feed call. This is the main reason to pick Next over a plain SPA.
- Database: Supabase (managed Postgres). Real DB, generous free tier, good dashboard, portable.
- ORM/migrations: Drizzle ORM. Typed schema, tracked migrations, tests cleanly.
- Hosting: Vercel (git-push deploys, free hobby tier, edge caching for `/api/state`).
- Map: MapLibre GL JS with MapTiler dark vector tiles (free tier, one API key). Protomaps pmtiles is the no-key alternative if you would rather not sign up for MapTiler.
- Validation: Zod schemas shared between client and server.
- Tests: Vitest (unit + integration with the feed mocked) and Playwright (e2e). GitHub Actions CI.
- Styling: Tailwind CSS with the design tokens in section 9.

### Things that are costly or annoying to undo (decide deliberately)

1. Database + host choice (Supabase + Vercel). Switching DB vendor later means a data migration. Switching host is easier. Mitigation: all DB access goes through a thin repo layer in `lib/db/` so the rest of the app never imports the client directly. If you ever move off Supabase, you change one folder.
2. Serverless + Postgres connection mode. Vercel functions open many short-lived connections. You MUST connect at runtime through Supabase's pooled connection string (Supavisor / PgBouncer, transaction mode, port 6543), and use the direct connection (port 5432) only for migrations. Getting this wrong shows up as random "too many connections" errors under load, which is hard to debug after the fact. This is set once in env and then it is fine.
3. Auth model. We use a shared passcode plus a per-row edit token (section 6), not real accounts. That is the right call for a friendly 100-person cohort. The principled upgrade (Slack OAuth so people can only edit their own row, and we could pull avatars) needs a Slack app approved in the Hack Club workspace, which a regular member almost certainly cannot get. Treat Slack OAuth as a documented stretch, not v1. Designing v1 around the passcode does not block adding OAuth later because edits already key off an identity token.

---

## 3. Data source: ADS-B feeds

Verified behavior (tested live from this environment):

- adsb.lol: `GET https://api.adsb.lol/v2/point/{lat}/{lon}/{radiusNm}` returns `{ ac: [...] }`. No key, no auth. License is ODbL 1.0, so attribution is required and must be shown in the UI. Rate limits are dynamic with load; a 4xx means back off. Max radius is 250 nm.
- airplanes.live: `GET https://api.airplanes.live/v2/point/{lat}/{lon}/{radiusNm}`, same response shape. Hard limit of 1 request per second. Send a descriptive `User-Agent`.

Both return per-aircraft objects with the fields we need: `hex`, `flight` (callsign, has trailing spaces, trim it), `r` (registration), `t` (ICAO type like B738), `alt_baro` (number or the string `"ground"`), `gs` (ground speed, knots), `track` (degrees), `lat`, `lon`, `seen_pos` (seconds since last position).

Feed strategy in `lib/adsb.ts`:

- Query a configurable list of center bubbles. Default is one bubble over the Pearl River Delta: `[[22.47, 113.86, 250]]`. This single bubble covers HKG, SZX, and the whole approach corridor. Optional extra centers (over SE Asia, Bay of Bengal) can be added to catch flights earlier in their route; default is just PRD.
- Try adsb.lol first. On any failure or non-200, fall back to airplanes.live (with the User-Agent header). If both fail, return an empty aircraft list and let the rest of the payload still render (board works, map just has no live dots).
- Cache the upstream result for about 10 seconds (use Next's `fetch` data cache with `next: { revalidate: 10 }`, or an equivalent in-process cache keyed by center). Dedupe aircraft across centers by `hex`.
- Export an attribution constant the UI renders, e.g. `data: adsb.lol (ODbL) and airplanes.live`.

Do NOT use OpenSky. It now requires OAuth2 (since March 2026), caps anonymous use at 400 credits/day, and was returning 503s across the board during research. adsb.lol + airplanes.live are simpler, keyless, and were up.

---

## 4. Flight number to live position

This is the core matching logic. Put it in `lib/callsign.ts`, fully unit tested.

A person submits a marketing flight number like `CX216` or `UO541`. ADS-B broadcasts the operating carrier's callsign, like `CPA216` or `HKE541`. We bridge the two with an IATA to ICAO airline map (provided in `airlines.json`).

Algorithm:

1. Normalize the flight number: uppercase, strip every non-alphanumeric character. `cx 216` becomes `CX216`.
2. If the person provided a callsign override, the candidate set is just the normalized override. (The form has an optional advanced "callsign override" field for codeshares and misses.)
3. Otherwise, for prefix length 2 then 3: take that many leading characters as the airline prefix and the rest as the number. If the airline map has that prefix and the remainder starts with a digit, build candidates `ICAO + number` and `ICAO + number with leading zeros stripped`. Example: `CX216` to `CPA216`; `6E123` to `IGO123`; `CX0216` to both `CPA0216` and `CPA216`.
4. Always also add the normalized input itself as a candidate (covers people who already typed the ICAO callsign).
5. Build a lookup from the live feed: trimmed uppercased `flight` to aircraft, deduped by `hex`. A participant matches if any candidate equals a feed callsign. Take the first match. If multiple aircraft share a callsign, prefer the one with the smallest `seen_pos` (freshest position).

Known limitation to surface in the UI and README: a long-haul flight only gets a dot once it is within about 250 nm of the delta (community ADS-B coverage), and codeshares broadcast the operating carrier's callsign rather than the marketing one. The callsign override field is the escape hatch for both.

---

## 5. Status derivation

Put this in `lib/status.ts`, unit tested with a truth table.

Per participant, given the matched aircraft (or no match):

- Matched and airborne (`alt_baro` is a number above the ground threshold of 75 ft, and not the string `"ground"`): status is `air`. Record that we saw it airborne (update `last_seen_airborne_at` on the row; see section 6).
- Matched, on ground, within 8 nm of its destination airport: status is `landed`.
- Matched, on ground, far from destination: status is `expected` (most likely still sitting at origin).
- Not matched, but `last_seen_airborne_at` is within the last 4 hours and the arrival date is today or earlier: status is `landed` (it was in the air, now it is gone from the feed, it came down).
- Not matched, nothing else: status is `expected`.

Also compute, when airborne: great-circle distance from current position to the chosen destination airport, and an ETA. ETA minutes is `distanceNm / groundSpeedKt * 60` when ground speed is above 50 kt, otherwise null. Format an ETA clock in the destination's timezone (HKG uses `Asia/Hong_Kong`, SZX uses `Asia/Shanghai`, both UTC+8, no DST).

---

## 6. Data model and API

### Database: `participants` table

| column                | type                 | notes                                                                           |
| --------------------- | -------------------- | ------------------------------------------------------------------------------- |
| id                    | uuid pk              | default `gen_random_uuid()`                                                     |
| name                  | text not null        | 1 to 60 chars                                                                   |
| flight_number         | text not null        | stored normalized uppercase, e.g. `CX216`                                       |
| callsign_override     | text null            | optional explicit ADS-B callsign                                                |
| origin_iata           | text null            | 3 letters, uppercased, e.g. `DEL`                                               |
| origin_city           | text null            | free text, e.g. `Delhi`                                                         |
| destination           | text not null        | check in (`HKG`, `SZX`)                                                         |
| arrival_date          | date null            | the day they land                                                               |
| slack_handle          | text null            | plain text, e.g. `@fish`                                                        |
| last_seen_airborne_at | timestamptz null     | set when we observe the flight airborne; powers landed detection                |
| edit_token            | uuid not null        | default `gen_random_uuid()`; returned to creator so they can edit their own row |
| created_at            | timestamptz not null | default `now()`                                                                 |
| updated_at            | timestamptz not null | default `now()`, bump on update                                                 |

Origin coordinates for the route line come from a bundled airport dataset, not the DB. See section 7.

### `GET /api/state`

The single endpoint that powers the map, board, and counter. Returns:

```jsonc
{
  "updatedAt": "<iso>",
  "trafficInRange": 53, // total aircraft the feed sees in our bubble(s)
  "airports": {
    "HKG": {
      "name": "Hong Kong Intl",
      "icao": "VHHH",
      "lat": 22.308,
      "lon": 113.918,
    },
    "SZX": {
      "name": "Shenzhen Bao'an",
      "icao": "ZGSZ",
      "lat": 22.639,
      "lon": 113.811,
    },
  },
  "participants": [
    {
      "id": "uuid",
      "name": "Fish",
      "slackHandle": "@fish",
      "flightNumber": "CX216",
      "destination": "HKG",
      "arrivalDate": "2026-07-01",
      "origin": { "iata": "DEL", "city": "Delhi", "lat": 28.556, "lon": 77.1 }, // or null
      "status": "air", // air | landed | expected | taxiing
      "live": {
        // null when not matched
        "callsign": "CPA216",
        "lat": 24.1,
        "lon": 110.2,
        "track": 118.0,
        "altFt": 35000,
        "groundSpeedKt": 451,
        "aircraftType": "B789",
        "registration": "B-LXA",
        "distToDestNm": 240,
        "etaMinutes": 32,
        "etaLocal": "14:32",
      },
    },
  ],
}
```

Caching: set `Cache-Control: public, s-maxage=8, stale-while-revalidate=30`. Most viewer polls are served from Vercel's edge cache. On a cache miss the handler runs, which also refreshes the upstream feed and updates `last_seen_airborne_at` for any airborne participants. New submissions appear within about 8 seconds, which is fine. Never call the real feed in tests.

### `POST /api/participants` (create)

Body: `{ passcode, name, flightNumber, callsignOverride?, originIata?, originCity?, destination, arrivalDate?, slackHandle? }`.

- Validate `passcode === WRITE_PASSCODE`, else 403.
- Validate with Zod: name 1 to 60, flightNumber matches `^[A-Z0-9]{2,8}$` after normalize, destination in HKG/SZX, originIata is 3 letters if present, arrivalDate parses if present, slackHandle under 40 chars.
- Insert, return `{ id, editToken }`. The browser stores `editToken` in localStorage keyed by id so that person can later edit or remove their own entry.

### `PATCH /api/participants/:id` (edit)

Body: the editable fields plus auth, where auth is either `{ editToken }` matching the row, or `{ passcode }` matching `ADMIN_PASSCODE`. Update allowed fields, bump `updated_at`. 404 on unknown id, 403 on bad auth.

### `DELETE /api/participants/:id`

Auth: `editToken` match or admin passcode. Remove the row. 404 / 403 as above.

Optional hardening: a light per-IP rate limit on writes (Upstash Ratelimit, or skip for v1 and rely on the passcode). The passcode is the real gate.

---

## 7. Bundled reference data

- `airlines.json`: the IATA to ICAO airline map. Provided alongside this spec. Covers the carriers that actually fly into HKG and SZX from likely cohort origins (India, SE Asia, greater China, Gulf, plus common long-haul). Load it in `lib/airlines.ts`. Extend if a cohort member's carrier is missing.
- `airports.json`: bundle a trimmed subset of the OurAirports dataset (public domain) so origin codes resolve to coordinates and city names offline, with no airport API. Generate it from `https://davidmegginson.github.io/ourairports-data/airports.csv`: keep rows that have a non-empty IATA code and a valid lat/lon, output `{ iata, icao, name, city, country, lat, lon }`. This file places origin dots and draws route lines. HKG and SZX are in it too, but also hardcode HKG and SZX coordinates in `lib/config.ts` so the hero never depends on the dataset loading.

Do not place secrets or personal data in either file. They are static reference assets.

---

## 8. Map (the hero)

MapLibre GL JS. Dark vector tiles from MapTiler (e.g. the `dataviz-dark` or `darkmatter` style) using `NEXT_PUBLIC_MAPTILER_KEY`. Protomaps pmtiles is the no-key fallback.

Default view: centered around `[113.86, 22.5]`, zoom about 6.5, framed so the PRD funnel is the center of gravity. Fully pannable and zoomable.

Layers, from bottom to top:

1. Range rings: concentric circles at 50, 150, and 250 nm around the PRD centroid (the 250 nm ring is literally the feed bubble, so it means something). Thin sodium-amber stroke, low opacity. Build the circle polygons with a small helper or turf.
2. Airport markers: HKG and SZX, amber, labeled.
3. Route lines: for each airborne matched participant, a great-circle line from origin airport (if the origin code is known) through the current position to the destination airport. Render as two stacked line layers, a wider blurred glow under a thin bright cyan line. Animate a moving dash along the line toward the destination to imply direction and motion.
4. Planes: a symbol layer with a plane glyph rotated by `track`, cyan with a soft glow. Show the name or flight number as a label at higher zooms.

Motion: between `/api/state` polls (every ~15s), dead-reckon each airborne plane forward along its track at its ground speed using `requestAnimationFrame` at roughly 3 updates per second, and advance the leading segment of its route line. On each poll, reconcile to the true positions with a short tween (about 1s) so dots glide rather than jump.

Interactions: clicking or tapping a plane opens a popup with callsign, type, registration, altitude, ground speed, distance to destination, ETA local, the person's name, and slack handle. Hovering a plane highlights its route line. Clicking a board row centers the map on that person's plane.

Quiet state: when no planes are airborne, still show airports and rings, plus a small chip like "no flights airborne right now." The board and counter carry these windows.

Accessibility: respect `prefers-reduced-motion`. With reduced motion, skip dead-reckoning and dash animation and just update positions on each poll. The map must still be usable.

---

## 9. Design system

Direction: a night flight-ops board. Sodium-amber and radar-cyan on midnight indigo, with a split-flap arrivals board as the signature. Not the usual dark-mode-with-one-green-accent look. Spend the boldness on the split-flap board and the radar range-rings, keep everything else quiet and disciplined.

Color tokens:

- bg `#0A0E1A` (midnight indigo)
- panel `#111726`, panel-2 `#0F1422`
- border/line `#1E2740`
- amber `#F5A623` (primary accent, sodium-vapor), amber-bright `#FFB000`
- cyan `#45E0D8` (in air, radar trace)
- jade `#46C08D` (landed)
- coral `#FF6B5B` (delay / alert)
- text `#E6ECF5`, muted `#8893A8`

Type:

- Display: Saira Condensed 700, for the big title and section labels (aerospace feel).
- UI: Inter 400 / 500 / 600.
- Data / mono: JetBrains Mono 400 / 500 / 700, for callsigns, altitudes, ETAs, and the split-flap board.

Signature elements: the split-flap (Solari) arrivals board, where a row's status cell flips on change (subtle, reduced-motion aware), and the radar range-rings on the map.

Quality floor (build to it without announcing it): responsive down to mobile (map on top, board below, the add-flight form as a full-screen sheet), visible keyboard focus, color contrast at least AA, reduced motion respected everywhere.

Copy rules: casual, lowercase-leaning, plain verbs, no filler. No em dashes. Empty states give direction ("no flights on the board yet, add yours to drop the first dot"), errors say what happened and how to fix it. This matches the project owner's voice.

Social preview: the link gets pasted in Slack, so it has to look legit. Add Open Graph and Twitter meta with a good title, description, and an OG image. A dynamic OG image showing the live counter ("37 of 100 landed") is a strong stretch.

---

## 10. Support UI

- Arrivals board: split-flap styled rows, grouped by status in the order In Air, then Expected (sub-grouped or sorted by arrival date), then Landed. Each row shows name, slack handle, flight number (mono), origin city with code, a destination tag colored per airport (HKG vs SZX), and when airborne the altitude, ground speed, and ETA. Flip animation on status change.
- Counter: "X in air, Y landed, Z expected", plus "N of M cohort arrived".
- Find-your-flight: a search box that highlights matching rows, a grouping that shows everyone sharing your flight number, and a control to center the map on your plane.
- Add / edit flight: a dialog with the schema fields plus the passcode field (remembered in localStorage after first use) and an advanced section with the callsign override. Optimistic add on submit. Show an "edit or remove my entry" affordance for entries whose edit token is in localStorage.
- Header: title "FALLOUT // ARRIVALS — SHENZHEN", live HKT and UTC clocks, and a countdown to the event start. Event name and start time live in `lib/config.ts` so they are trivial to change.

---

## 11. Config, env, and repo layout

`.env.example` (every var documented):

- `DATABASE_URL` — Supabase pooled connection string, transaction mode, port 6543. Used at runtime.
- `DIRECT_URL` — Supabase direct connection, port 5432. Used only for migrations.
- `WRITE_PASSCODE` — shared cohort passcode required to create an entry.
- `ADMIN_PASSCODE` — your override to edit or remove any entry.
- `NEXT_PUBLIC_MAPTILER_KEY` — map tiles. Omit if using Protomaps.
- `NEXT_PUBLIC_EVENT_NAME` — e.g. `Fallout 2026`.
- `NEXT_PUBLIC_EVENT_START_ISO` — e.g. `2026-07-01T00:00:00+08:00`, for the countdown.
- `ADSB_CENTERS` — optional JSON override of the feed bubbles. Default is the PRD bubble.

`lib/config.ts` holds the non-secret constants: HKG and SZX coordinates and metadata, ground threshold (75 ft), landed radius (8 nm), landed memory window (4 h), poll interval (15 s), feed cache window (10 s), default centers.

Repo layout:

```
fallout-arrivals/
  app/
    layout.tsx
    page.tsx
    api/
      state/route.ts
      participants/route.ts
      participants/[id]/route.ts
  components/
    Map/            (MapLibre setup, layers, dead-reckoning hook, popups)
    Board/          (split-flap rows, grouping)
    Counter.tsx
    AddFlightDialog.tsx
    FindFlight.tsx
    Clocks.tsx
    Countdown.tsx
  lib/
    adsb.ts         (feed fetch, cache, fallback, attribution constant)
    callsign.ts     (normalize, candidate generation, matching)
    airlines.ts     (loads airlines.json)
    airports.ts     (loads airports.json, iata lookup)
    geo.ts          (great-circle distance, bearing, destPoint, range-ring polygons)
    status.ts       (status derivation, ETA)
    schema.ts       (zod schemas, shared client and server)
    config.ts
    db/
      schema.ts     (drizzle table)
      client.ts     (pooled connection)
      repo.ts       (create, read, update, delete, touch last_seen_airborne_at)
  data/
    airlines.json
    airports.json   (generated, see section 7)
  drizzle/          (migrations)
  test/
    unit/
    integration/
    e2e/
    fixtures/       (recorded adsb feed JSON, etc.)
  .env.example
  README.md
  package.json, tsconfig.json, eslint, prettier, vitest.config, playwright.config
  .github/workflows/ci.yml
```

---

## 12. Testing strategy

The standard is tests that actually catch regressions, not coverage theater. Never hit the real ADS-B feed in any test.

Unit (Vitest):

- airline map: known mappings present and correct (CX to CPA, 6E to IGO, UO to HKE, AI to AIC, MU to CES).
- callsign candidates: 2 vs 3 char prefix parsing, leading-zero handling, override path, direct-ICAO-input path.
- matching: given a feed fixture, a participant's flight number resolves to the right aircraft; no match returns null cleanly.
- geo: great-circle distance against known city pairs within tolerance; bearing and destPoint round-trip; range-ring polygon has the expected radius.
- status truth table: airborne to air; on-ground near dest to landed; on-ground far to expected; not-matched plus recent airborne to landed; not-matched plus nothing to expected.
- ETA: distance over ground speed to minutes; ground speed under 50 returns null; ETA clock formats in Asia/Hong_Kong and Asia/Shanghai.
- origin lookup: known IATA resolves to coordinates and city; unknown IATA returns null without throwing.
- zod: rejects bad flight numbers, bad destination, oversized name, malformed date.

Integration (route handlers, upstream feed mocked with MSW or a fetch mock, against a Postgres service container):

- `/api/state` returns the documented shape, matches a seeded participant against a feed fixture, sets the cache header, falls back to airplanes.live when adsb.lol errors, and returns participants with `live: null` when both feeds are down.
- `last_seen_airborne_at` updates when a participant is observed airborne, and the landed logic uses it.
- create: rejects wrong passcode (403), accepts valid input, returns an edit token, normalizes the flight number, enforces validation.
- edit and delete: edit-token path works, admin-passcode path works, neither returns 403, unknown id returns 404.

E2E (Playwright, against `next build` then `next start`):

- home loads, the map canvas renders, airports show, the board renders.
- open the add-flight form, submit with the passcode, the row appears in the board, reload and it persists.
- edit your own entry (edit token in localStorage), the change reflects.
- `prefers-reduced-motion` set: no animation errors, dots still placed.
- mobile viewport: layout stacks, the form is a sheet.

CI (GitHub Actions on pull request and main): install, typecheck, lint, vitest, build, playwright. Use a Postgres service container with migrations applied. Mock the feed.

---

## 13. Deployment runbook

Steps marked (you) need a human: they involve creating third-party accounts and copying the keys.

1. (you) Create a GitHub repo. Push the project.
2. (you) Create a Supabase project. Copy the pooled connection string (port 6543, transaction mode) into `DATABASE_URL` and the direct string (5432) into `DIRECT_URL`.
3. (you) Create a MapTiler account, copy the key into `NEXT_PUBLIC_MAPTILER_KEY`. Or choose Protomaps and skip this.
4. Run migrations against Supabase using `DIRECT_URL` (`drizzle-kit migrate` or `push`).
5. (you) Create a Vercel project, import the GitHub repo, set all env vars, deploy. Vercel redeploys on every push.
6. (you) Set `WRITE_PASSCODE` and `ADMIN_PASSCODE`. Share the link and the write passcode in the cohort chat.
7. (optional) Add Upstash Redis for write rate-limiting. Add Slack OAuth later if a workspace app is ever approved.

Verify after deploy: the map renders with airports and rings, submitting a test flight with the passcode shows it in the board and persists across reload, and if a current cohort flight is airborne in range it shows a moving dot.

---

## 14. Build plan (small, reviewable stages)

Each stage is its own pull request with passing tests before merge. Do not build it all in one shot.

Stage 0 — Scaffold and guardrails. Next + TS strict + Tailwind, ESLint and Prettier, Vitest and Playwright configured, CI skeleton, `.env.example`, README, `lib/config.ts` with HKG/SZX and event constants. Done when `dev` serves a placeholder and CI is green on empty tests.

Stage 1 — Pure data layer (no UI, no network), fully unit tested. `airlines.json` (provided), `airports.json` (generated), `lib/callsign.ts`, `lib/geo.ts`, `lib/status.ts`, `lib/schema.ts`. Done when all unit tests in section 12 pass.

Stage 2 — ADS-B integration lib. `lib/adsb.ts` with adsb.lol primary, airplanes.live fallback, caching, User-Agent, and the attribution constant. Integration tests with a recorded fixture and a mocked upstream. Done when matching a known callsign against the fixture returns the right position and the fallback path is covered, with no real network calls.

Stage 3 — Database. Drizzle schema and migrations, pooled Supabase client, the participants repo (create, read, update, delete, touch last_seen). Tests against a Postgres service container. Done when migrations apply and CRUD plus the last_seen update work.

Stage 4 — API routes. `/api/state` (cached, combined payload), create, edit, delete with passcode and edit-token auth and zod validation. Integration tests. Done when the contract in section 6 matches the tests, auth paths are enforced, and cache headers are set.

Stage 5 — Map hero. MapLibre dark style, framed view, airports, range rings, plane layer, route lines, popups, the dead-reckoning hook, reduced-motion handling. Done when airborne planes from `/api/state` render and move smoothly, popups work, the quiet state is handled, and a Playwright check confirms the canvas.

Stage 6 — Support UI. Arrivals board (split-flap, grouped), counter, find-your-flight, clocks and countdown, design tokens applied. Done when the board reflects `/api/state`, grouping and search work, and it is responsive.

Stage 7 — Add and edit flow. The dialog with zod-validated form, passcode handling (remembered), create to optimistic add to edit-token stored, edit and remove your own entry, admin override. Done when the e2e submit, appears, persists, and edit flows pass.

Stage 8 — Polish and hardening. Error and empty states with directive copy, accessibility (focus, contrast, aria), reduced motion everywhere, the attribution footer, Open Graph and Twitter meta plus an OG image, favicon, optional write rate-limit, README finalized with the manual setup checklist and screenshots. Done when contrast and reduced-motion checks pass, the OG preview renders, the full suite is green, and a Vercel deploy succeeds.

Stage 9 — Stretch (optional). Supabase Realtime for instant submissions, Slack OAuth for edit-your-own and avatars, persistent route trails, a shareable "my flight card" image, a dynamic OG image with the live counter.

---

## 15. Definition of done

- All stages 0 through 8 merged, every stage's tests green, full suite passing in CI.
- Deployed on Vercel, reachable, the map renders and a real airborne cohort flight shows a moving dot.
- A non-technical cohort member can add their flight with the passcode and see it on the board and map.
- adsb.lol and airplanes.live attribution is visible. No secrets in the repo. Reduced motion and keyboard focus work. The Slack link preview looks good.
- README explains setup, the manual account steps, env vars, how matching works, and the known coverage and codeshare limitation.
