/**
 * scripts/build-airports.ts
 *
 * Downloads the OurAirports public-domain dataset and writes data/airports.json.
 *
 * Usage:
 *   npx tsx scripts/build-airports.ts
 *
 * No npm packages, uses only Node 20 built-ins (global fetch, node:fs, node:path).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CSV_URL =
  "https://davidmegginson.github.io/ourairports-data/airports.csv";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dir, "..", "data", "airports.json");

/** Priority score for deduplication: higher keeps the row. */
const TYPE_PRIORITY: Record<string, number> = {
  large_airport: 3,
  medium_airport: 2,
  small_airport: 1,
};

interface AirportEntry {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

/**
 * Full RFC-4180-compliant CSV parser.
 * Handles:
 *   - Quoted fields that contain commas
 *   - Escaped double-quotes inside quoted fields ("")
 *   - Both \r\n and bare \n line endings
 *   - Quoted fields that span multiple lines (embedded newlines)
 */
function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuote = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv.charAt(i);

    if (inQuote) {
      if (ch === '"') {
        // "" inside a quoted field is an escaped quote
        if (csv.charAt(i + 1) === '"') {
          field += '"';
          i++; // skip second quote
        } else {
          inQuote = false; // closing quote
        }
      } else {
        field += ch;
      }
    } else {
      switch (ch) {
        case '"':
          inQuote = true;
          break;
        case ",":
          row.push(field);
          field = "";
          break;
        case "\r":
          row.push(field);
          field = "";
          rows.push(row);
          row = [];
          if (csv.charAt(i + 1) === "\n") i++; // consume \n in \r\n
          break;
        case "\n":
          row.push(field);
          field = "";
          rows.push(row);
          row = [];
          break;
        default:
          field += ch;
      }
    }
  }

  // Flush the final field/row when there is no trailing newline
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Round to 5 decimal places for a stable, compact representation. */
function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

async function main(): Promise<void> {
  console.log(`Fetching ${CSV_URL} …`);
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  console.log(`Downloaded ${text.length.toLocaleString()} bytes. Parsing …`);

  const rows = parseCSV(text);
  const header = rows[0];
  if (!header) throw new Error("Empty CSV, nothing to parse.");

  /** Locate a required column index by name. */
  function colIdx(name: string): number {
    const n = header!.indexOf(name);
    if (n === -1) throw new Error(`CSV is missing expected column: "${name}"`);
    return n;
  }

  const CI = {
    ident: colIdx("ident"),
    type: colIdx("type"),
    name: colIdx("name"),
    lat: colIdx("latitude_deg"),
    lon: colIdx("longitude_deg"),
    country: colIdx("iso_country"),
    city: colIdx("municipality"),
    gps: colIdx("gps_code"),
    iata: colIdx("iata_code"),
  };

  // Exactly 3 ASCII letters, case-insensitive
  const IATA_RE = /^[A-Za-z]{3}$/;

  const out: Record<string, AirportEntry> = {};
  const outPriority: Record<string, number> = {};

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 2) continue;

    const rawIata = row[CI.iata] ?? "";
    if (!IATA_RE.test(rawIata)) continue;

    const iata = rawIata.toUpperCase();
    const lat = parseFloat(row[CI.lat] ?? "");
    const lon = parseFloat(row[CI.lon] ?? "");

    if (!isFinite(lat) || !isFinite(lon)) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

    const type = row[CI.type] ?? "";
    const priority = TYPE_PRIORITY[type] ?? 0;

    // Deduplication: keep the highest-priority type; first-seen wins ties
    const existingPriority = outPriority[iata];
    if (existingPriority !== undefined && existingPriority >= priority)
      continue;

    const gps = (row[CI.gps] ?? "").trim();
    const ident = (row[CI.ident] ?? "").trim();

    out[iata] = {
      iata,
      icao: gps !== "" ? gps : ident,
      name: row[CI.name] ?? "",
      city: (row[CI.city] ?? "").trim(),
      country: row[CI.country] ?? "",
      lat: round5(lat),
      lon: round5(lon),
    };
    outPriority[iata] = priority;
  }

  // Stable alphabetical key order for clean diffs
  const sorted: Record<string, AirportEntry> = {};
  for (const k of Object.keys(out).sort()) {
    const v = out[k];
    if (v !== undefined) sorted[k] = v;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(sorted, null, 2) + "\n");

  console.log(
    `Wrote ${Object.keys(sorted).length.toLocaleString()} airports → ${OUT_PATH}`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
