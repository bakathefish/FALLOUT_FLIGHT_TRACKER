import type {
  Map as MlMap,
  GeoJSONSource,
  LayerSpecification,
} from "maplibre-gl";
import { PRD_CENTROID, RANGE_RINGS_NM } from "@/lib/config";
import { rangeRingPolygon, greatCirclePoints } from "@/lib/geo";
import type { ParticipantState } from "@/lib/apiState";
import type { AirportsMap } from "@/lib/uiContracts";

// source + layer ids, geojson builders, and the one-time layer setup. the map
// is driven entirely by these four geojson sources, updated with setData on
// every poll/frame instead of tearing anything down.

export const SRC = {
  rings: "fa-rings",
  airports: "fa-airports",
  routes: "fa-routes",
  planes: "fa-planes",
} as const;

export const LYR = {
  rings: "fa-rings-line",
  airportGlow: "fa-airport-glow",
  airports: "fa-airports-circle",
  airportLabel: "fa-airports-label",
  routeGlow: "fa-route-glow",
  routeLine: "fa-route-line",
  planeGlow: "fa-plane-glow",
  planes: "fa-plane-icon",
  planeLabel: "fa-plane-label",
} as const;

export const PLANE_ICON_ID = "fa-plane";

// dasharray steps for the flowing route dash (classic maplibre technique).
// each step keeps the same total length so the gap appears to slide toward the
// destination. never stepped under reduced motion.
export const DASH_SEQ: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

const ROUTE_STEPS = 24;

/** a displayed plane position: dead-reckoned/tweened lat, lon, and heading. */
export interface DisplayPos {
  lat: number;
  lon: number;
  track: number;
}
export type DisplayMap = Map<string, DisplayPos>;

export const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/** a participant we can actually place on the map right now. */
function isShown(p: ParticipantState): boolean {
  return p.status === "air" && p.live != null;
}

export function buildRingsData(): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const maxNm = Math.max(...RANGE_RINGS_NM);
  return {
    type: "FeatureCollection",
    features: RANGE_RINGS_NM.map((nm) => ({
      type: "Feature",
      properties: { nm, edge: nm === maxNm },
      geometry: {
        type: "LineString",
        coordinates: rangeRingPolygon(PRD_CENTROID.lat, PRD_CENTROID.lon, nm),
      },
    })),
  };
}

export function buildAirportsData(
  airports: AirportsMap,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const codes = Object.keys(airports) as (keyof AirportsMap)[];
  return {
    type: "FeatureCollection",
    features: codes.map((code) => {
      const a = airports[code];
      return {
        type: "Feature",
        properties: { code, name: a.name },
        geometry: { type: "Point", coordinates: [a.lon, a.lat] },
      };
    }),
  };
}

export function buildPlanesData(
  participants: ParticipantState[],
  pos: DisplayMap,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const p of participants) {
    if (!isShown(p) || !p.live) continue;
    const d = pos.get(p.id) ?? {
      lat: p.live.lat,
      lon: p.live.lon,
      track: p.live.track ?? 0,
    };
    features.push({
      type: "Feature",
      properties: { id: p.id, label: p.name || p.flightNumber, track: d.track },
      geometry: { type: "Point", coordinates: [d.lon, d.lat] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function buildRoutesData(
  participants: ParticipantState[],
  pos: DisplayMap,
  airports: AirportsMap,
  hoveredId: string | null,
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const p of participants) {
    if (!isShown(p) || !p.live || !p.origin) continue;
    const d = pos.get(p.id) ?? {
      lat: p.live.lat,
      lon: p.live.lon,
      track: p.live.track ?? 0,
    };
    const dest = airports[p.destination];
    const leg1 = greatCirclePoints(
      p.origin.lat,
      p.origin.lon,
      d.lat,
      d.lon,
      ROUTE_STEPS,
    );
    const leg2 = greatCirclePoints(
      d.lat,
      d.lon,
      dest.lat,
      dest.lon,
      ROUTE_STEPS,
    );
    features.push({
      type: "Feature",
      properties: { id: p.id, hovered: p.id === hoveredId },
      geometry: {
        type: "LineString",
        coordinates: leg1.concat(leg2.slice(1)),
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/** push new geojson into a source without rebuilding it. */
export function setSourceData(
  map: MlMap,
  id: string,
  data: GeoJSON.FeatureCollection,
): void {
  const src = map.getSource<GeoJSONSource>(id);
  if (src) src.setData(data);
}

/** draw a north-pointing arrowhead once, register it for the plane symbol. */
export function addPlaneIcon(map: MlMap): void {
  if (map.hasImage(PLANE_ICON_ID)) return;
  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.moveTo(20, 4);
  ctx.lineTo(33, 34);
  ctx.lineTo(20, 26);
  ctx.lineTo(7, 34);
  ctx.closePath();
  ctx.fillStyle = "#45E0D8";
  ctx.strokeStyle = "rgba(8,12,22,0.95)";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.stroke();
  const img = ctx.getImageData(0, 0, size, size);
  map.addImage(PLANE_ICON_ID, img, { pixelRatio: 2 });
}

/** add the four sources and all layers, bottom to top. idempotent. */
export function addSourcesAndLayers(map: MlMap): void {
  if (!map.getSource(SRC.rings)) {
    map.addSource(SRC.rings, { type: "geojson", data: buildRingsData() });
  }
  if (!map.getSource(SRC.airports)) {
    map.addSource(SRC.airports, { type: "geojson", data: EMPTY_FC });
  }
  if (!map.getSource(SRC.routes)) {
    map.addSource(SRC.routes, { type: "geojson", data: EMPTY_FC });
  }
  if (!map.getSource(SRC.planes)) {
    map.addSource(SRC.planes, { type: "geojson", data: EMPTY_FC });
  }

  addPlaneIcon(map);

  // 1. range rings. the 250 nm edge (the feed bubble) reads slightly clearer.
  const ringsLayer: LayerSpecification = {
    id: LYR.rings,
    type: "line",
    source: SRC.rings,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#F5A623",
      "line-width": ["case", ["get", "edge"], 1.4, 0.7],
      "line-opacity": ["case", ["get", "edge"], 0.5, 0.22],
      "line-dasharray": [3, 3],
    },
  };

  // 2. airports: a soft amber glow, a solid dot, and a code label.
  const airportGlow: LayerSpecification = {
    id: LYR.airportGlow,
    type: "circle",
    source: SRC.airports,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 8, 10, 16],
      "circle-color": "#F5A623",
      "circle-blur": 1,
      "circle-opacity": 0.22,
    },
  };
  const airportDot: LayerSpecification = {
    id: LYR.airports,
    type: "circle",
    source: SRC.airports,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3.5, 10, 6],
      "circle-color": "#FFB000",
      "circle-stroke-color": "#0A0E1A",
      "circle-stroke-width": 1.5,
    },
  };
  const airportLabel: LayerSpecification = {
    id: LYR.airportLabel,
    type: "symbol",
    source: SRC.airports,
    layout: {
      "text-field": ["get", "code"],
      "text-font": ["Noto Sans Regular", "Open Sans Regular"],
      "text-size": 13,
      "text-offset": [0, 1.2],
      "text-anchor": "top",
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#FFB000",
      "text-halo-color": "#0A0E1A",
      "text-halo-width": 1.4,
    },
  };

  // 3. routes: a wide blurred glow under a thin bright animated line.
  const routeGlow: LayerSpecification = {
    id: LYR.routeGlow,
    type: "line",
    source: SRC.routes,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#45E0D8",
      "line-width": ["interpolate", ["linear"], ["zoom"], 4, 3, 10, 9],
      "line-blur": 4,
      "line-opacity": ["case", ["get", "hovered"], 0.55, 0.18],
    },
  };
  const routeLine: LayerSpecification = {
    id: LYR.routeLine,
    type: "line",
    source: SRC.routes,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#7FF0EA",
      "line-width": ["case", ["get", "hovered"], 2.4, 1.3],
      "line-opacity": ["case", ["get", "hovered"], 1, 0.75],
      "line-dasharray": [0, 4, 3],
    },
  };

  // 4. planes: a cyan glow, the rotated arrowhead, and a name label up close.
  const planeGlow: LayerSpecification = {
    id: LYR.planeGlow,
    type: "circle",
    source: SRC.planes,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 7, 10, 14],
      "circle-color": "#45E0D8",
      "circle-blur": 1,
      "circle-opacity": 0.35,
    },
  };
  const planeIcon: LayerSpecification = {
    id: LYR.planes,
    type: "symbol",
    source: SRC.planes,
    layout: {
      "icon-image": PLANE_ICON_ID,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 10, 1],
      "icon-rotate": ["get", "track"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  };
  const planeLabel: LayerSpecification = {
    id: LYR.planeLabel,
    type: "symbol",
    source: SRC.planes,
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Regular", "Open Sans Regular"],
      "text-size": 11,
      "text-offset": [0, 1.4],
      "text-anchor": "top",
      "text-allow-overlap": false,
      "text-optional": true,
    },
    paint: {
      "text-color": "#E6ECF5",
      "text-halo-color": "#0A0E1A",
      "text-halo-width": 1.3,
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 6.8, 0, 7.4, 1],
    },
  };

  const ordered: LayerSpecification[] = [
    ringsLayer,
    airportGlow,
    airportDot,
    airportLabel,
    routeGlow,
    routeLine,
    planeGlow,
    planeIcon,
    planeLabel,
  ];
  for (const layer of ordered) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  }
}
