import airlinesData from "@/data/airlines.json";

// IATA airline prefix -> ICAO callsign prefix. e.g. CX -> CPA.
// see SPEC section 4. extend data/airlines.json if a carrier is missing.
const IATA_TO_ICAO: Record<string, string> = airlinesData;

/** look up the ICAO callsign prefix for an IATA airline code. case-insensitive. */
export function iataToIcao(iata: string): string | undefined {
  return IATA_TO_ICAO[iata.toUpperCase()];
}

export function hasAirline(iata: string): boolean {
  return iataToIcao(iata) !== undefined;
}

export { IATA_TO_ICAO };
