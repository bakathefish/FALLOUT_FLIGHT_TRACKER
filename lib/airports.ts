import airportsData from "@/data/airports.json";

// origin airport lookup, for route lines and city labels. server-side only:
// the payload carries resolved coords so this big file never ships to clients.
// generated from OurAirports (public domain), see scripts/build-airports.ts.

export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

const AIRPORTS_DATA = airportsData as Record<string, Airport>;

/** resolve an IATA code to its airport, or null. case-insensitive, null-safe. */
export function lookupAirport(iata: string | null | undefined): Airport | null {
  if (!iata) return null;
  return AIRPORTS_DATA[iata.trim().toUpperCase()] ?? null;
}

export function airportCount(): number {
  return Object.keys(AIRPORTS_DATA).length;
}
