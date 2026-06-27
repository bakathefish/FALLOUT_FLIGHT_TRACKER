# Fallout Flight Tracker

a live board where the hack club fallout cohort watches each other's flights
converge on shenzhen and hong kong. open it on landing day and watch the dots
pile up on the pearl river delta.

the live map is the hero. dark flight-ops style, planes crawling toward HKG and
SZX, each dot a real cohort member's flight pulled straight from ADS-B. around
the map: an arrivals board (landed, in air, expected), a counter, and
find-your-flight. anyone with the link can look. adding or editing a flight
needs the shared passcode from the cohort chat.

## how matching works

you submit a marketing flight number like `CX216`. ADS-B does not broadcast
that. it broadcasts the operating carrier's callsign, like `CPA216`. so we
bridge the two:

1. normalize what you typed. `cx 216` becomes `CX216`.
2. map the airline prefix from IATA to ICAO using `airlines.json`. `CX` to
   `CPA`, `6E` to `IGO`, `UO` to `HKE`, and so on. that gives us candidate
   callsigns.
3. pull the live feed of every aircraft near the delta and look up each
   candidate by its broadcast callsign.
4. first match wins. that aircraft's live position becomes your dot, with a
   route line back to your origin airport.

matched and airborne flights show as moving dots. everyone else lives on the
board.

the ADS-B feed is only ever called from the server, once per cache window, no
matter how many people are watching. browsers never hit adsb.lol or
airplanes.live directly. that keeps us polite to the free feeds.

### known limits

two things are worth knowing up front so a missing dot does not look like a bug.

- **coverage.** a long-haul flight only gets a dot once it is within about
  250 nm of the delta. that is the reach of community ADS-B receivers, not
  something we control. your flight still shows on the board the whole way in,
  it just does not get a map dot until it is close.
- **codeshares.** the feed broadcasts the operating carrier's callsign, not the
  marketing one you booked. if you booked a codeshare, the airline prefix map
  will not find it. the escape hatch is the optional **callsign override** field
  in the advanced section of the add form. type the operating callsign there and
  it matches directly.

## stack

- next.js 15 (app router) + typescript strict, no `any`
- supabase postgres via drizzle
- maplibre gl with maptiler dark vector tiles (protomaps pmtiles is the no-key
  alternative)
- zod for validation on every boundary
- vitest + playwright, github actions ci
- deployed on vercel

## local setup

needs node 20 or newer.

```bash
npm install
cp .env.example .env     # then fill in the values, see the table below
npm run build:airports   # generates data/airports.json, run once
npm run dev
```

`build:airports` pulls the public-domain ourairports dataset and trims it to a
small bundled file so origin codes resolve to coordinates offline. you only need
to run it once (or when you want to refresh the data).

then open http://localhost:3000.

## env vars

every var lives in `.env.example` with a comment. here is the full list.

| var                           | kind   | what it is                                                                                                                                            | where to get it                                                    |
| ----------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`                | secret | supabase **pooled** connection string, transaction mode, port **6543**. used by the app at runtime.                                                   | supabase dashboard, project settings, database, connection pooling |
| `DIRECT_URL`                  | secret | supabase **direct** connection string, port **5432**. used **only** for migrations.                                                                   | same page, the direct connection string                            |
| `WRITE_PASSCODE`              | secret | shared passcode required to add a flight. share this one in the cohort chat.                                                                          | you pick it                                                        |
| `ADMIN_PASSCODE`              | secret | your override to edit or delete any row. keep this one to yourself.                                                                                   | you pick it                                                        |
| `NEXT_PUBLIC_MAPTILER_KEY`    | public | key for the dark map tiles. leave blank if you use the protomaps fallback.                                                                            | maptiler.com, free tier, account, keys                             |
| `NEXT_PUBLIC_EVENT_NAME`      | public | event name in the header, e.g. `Fallout 2026`.                                                                                                        | you set it                                                         |
| `NEXT_PUBLIC_EVENT_START_ISO` | public | event start as ISO 8601 with offset, e.g. `2026-07-01T00:00:00+08:00`. drives the countdown.                                                          | you set it                                                         |
| `ADSB_CENTERS`                | config | optional JSON override of the feed bubbles, `[[lat, lon, radiusNm], ...]`. default is the one pearl river delta bubble. max radius 250 nm per center. | leave unset unless you want extra bubbles                          |
| `MOCK_ADSB`                   | config | set to `1` in tests and e2e to serve recorded fixtures instead of the real feed.                                                                      | leave unset for normal runs                                        |

public vars (`NEXT_PUBLIC_*`) get inlined into the browser bundle, so never put
anything secret in them. the `secret` vars stay server-side only.

### the two connection strings matter

supabase gives you two. they are not interchangeable.

- runtime (the app, on vercel) connects through the **pooled** string on port
  **6543** (supavisor, transaction mode). serverless opens lots of short-lived
  connections, and the pooler is what keeps you from hitting "too many
  connections" under load. the runtime client also sets **`prepare: false`**,
  because transaction-mode pooling does not support prepared statements. get
  this wrong and it works locally then falls over in production.
- migrations connect through the **direct** string on port **5432**. drizzle-kit
  needs a real session, so point it at `DIRECT_URL` only.

## commands

```bash
npm run dev          # dev server
npm run build        # production build
npm run start        # serve the production build
npm run lint         # eslint
npm run typecheck    # tsc, no emit
npm test             # vitest run (unit + integration, feed always mocked)
npm run test:watch   # vitest in watch mode
npm run test:e2e     # playwright (builds and serves first)
npm run format       # prettier write
npm run format:check # prettier check
npm run db:generate  # generate a migration from the drizzle schema
npm run db:migrate   # apply migrations (uses DIRECT_URL)
npm run db:push      # push the schema straight to the db
npm run build:airports # regenerate data/airports.json
```

## testing

the suite needs no external services. you can clone, install, and run it.

- the **ADS-B feed is always mocked.** unit and integration tests serve recorded
  fixtures and never hit the real adsb.lol or airplanes.live. that keeps tests
  fast, deterministic, and polite to the free feeds.
- **db tests run against embedded postgres** (pglite), so there is no supabase
  or docker to stand up. just run the command.

```bash
npm test        # unit + integration
npm run test:e2e # end to end in playwright
```

ci runs typecheck, lint, the vitest suite, a build, and playwright on every pull
request and on main.

## rate limiting

adding or editing a flight is capped at 40 writes per minute per ip. it is an
in-memory counter, so on serverless each instance keeps its own window and the
cap is best-effort, not a hard global limit. the shared write passcode is the
real gate. if you ever need a strict limit, swap it for upstash ratelimit, a
drop-in upgrade. the code is in `lib/rateLimit.ts`.

## deploy

a full top-to-bottom runbook. nothing here points elsewhere. steps marked
**(you)** need a human, since they involve creating third-party accounts and
copying keys.

1. **(you)** create a github repo and push this project to it.
2. **(you)** create a supabase project. open project settings, database,
   connection pooling, and copy two strings: the **pooled** one (port **6543**,
   transaction mode) into `DATABASE_URL`, and the **direct** one (port **5432**)
   into `DIRECT_URL`. they are not interchangeable, the env vars section above
   says why.
3. apply the schema to the new database with `npm run db:migrate`. it runs
   against `DIRECT_URL`.
4. **(you)** optional: make a maptiler account (free tier) and put the key in
   `NEXT_PUBLIC_MAPTILER_KEY` for dark street tiles. with no key the map still
   works, it just falls back to a flat dark canvas with the range rings,
   airports, and plane dots drawn on it, no streets or labels. skip this step if
   that is fine.
5. **(you)** create a vercel project, import the github repo, and set every env
   var from the table above. deploy. vercel redeploys on each push after that.
6. **(you)** set `WRITE_PASSCODE` and `ADMIN_PASSCODE` in vercel. share the link
   and the write passcode in the cohort chat, and keep `ADMIN_PASSCODE` to
   yourself.
7. verify the live site, three checks:
   - the map renders with airports and range rings.
   - a test submit with the write passcode shows on the board and survives a
     reload.
   - a cohort flight airborne within ~250 nm of the delta shows a moving dot.
     nobody flying right now? the board still carries it, see known limits.

## screenshots

fill these in after the first deploy.

![the live map with planes over the pearl river delta](docs/screenshot-map.png)

![the split-flap arrivals board](docs/screenshot-board.png)

![the add-flight form](docs/screenshot-add.png)

## attribution

flight data comes from **adsb.lol** (licensed ODbL 1.0) and **airplanes.live**.
the attribution string is shown in the app footer, which is what the ODbL
license requires. do not remove it.

## license

the code is MIT. the flight data is not ours to relicense, it carries its own
ODbL 1.0 terms, see attribution above.
