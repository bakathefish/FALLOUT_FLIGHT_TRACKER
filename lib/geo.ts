// spherical-earth geo helpers. distances in nautical miles, angles in degrees.
// good enough for a flight board; we are not navigating with this.

export const EARTH_RADIUS_NM = 3440.065;

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;
/** normalize a longitude into the -180..180 range. */
const wrapLon = (lon: number): number =>
  ((((lon + 180) % 360) + 360) % 360) - 180;

/** great-circle (haversine) distance in nautical miles. */
export function distanceNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** initial great-circle bearing from point 1 to point 2, degrees 0..360. */
export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dl = toRad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x =
    Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** point reached by traveling distNm from (lat,lon) along bearing. */
export function destPoint(
  lat: number,
  lon: number,
  bearing: number,
  distNm: number,
): { lat: number; lon: number } {
  const d = distNm / EARTH_RADIUS_NM;
  const t = toRad(bearing);
  const p1 = toRad(lat);
  const l1 = toRad(lon);
  const p2 = Math.asin(
    Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t),
  );
  const l2 =
    l1 +
    Math.atan2(
      Math.sin(t) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2),
    );
  return { lat: toDeg(p2), lon: wrapLon(toDeg(l2)) };
}

/**
 * closed polygon ring of [lon, lat] points at radiusNm around a center.
 * used for the radar range rings on the map.
 */
export function rangeRingPolygon(
  lat: number,
  lon: number,
  radiusNm: number,
  steps = 72,
): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (360 * i) / steps;
    const p = destPoint(lat, lon, bearing, radiusNm);
    coords.push([p.lon, p.lat]);
  }
  return coords;
}

/**
 * points along the great-circle arc between two coords, as [lon, lat].
 * used to draw curved route lines on the map.
 */
export function greatCirclePoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  steps = 64,
): [number, number][] {
  const p1 = toRad(lat1);
  const l1 = toRad(lon1);
  const p2 = toRad(lat2);
  const l2 = toRad(lon2);
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((p2 - p1) / 2) ** 2 +
          Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2,
      ),
    );
  if (d === 0) {
    return [
      [lon1, lat1],
      [lon2, lat2],
    ];
  }
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2);
    const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2);
    const z = a * Math.sin(p1) + b * Math.sin(p2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    pts.push([toDeg(lon), toDeg(lat)]);
  }
  return pts;
}
