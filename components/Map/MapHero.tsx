"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MlMap,
  NavigationControl,
  Popup,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import type { MapHeroProps, AirportsMap } from "@/lib/uiContracts";
import type { ParticipantState } from "@/lib/apiState";
import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAPTILER_KEY,
} from "@/lib/config";
import { destPoint } from "@/lib/geo";
import {
  formatAltFt,
  formatSpeedKt,
  formatDistanceNm,
  formatEtaMinutes,
} from "@/lib/format";
import { buildMapStyle } from "./mapStyle";
import {
  SRC,
  LYR,
  DASH_SEQ,
  addSourcesAndLayers,
  buildAirportsData,
  buildPlanesData,
  buildRoutesData,
  setSourceData,
  type DisplayMap,
  type DisplayPos,
} from "./mapLayers";

// how often we push fresh geometry to the gpu while animating (~10/s). cheap
// for ~100 features and smooth enough for the reconcile tween to glide.
const MIN_TICK_MS = 100;
// how fast the route dash flows; lower is faster.
const DASH_SPEED_MS = 55;
// length of the glide from the last shown position to the new true position.
const TWEEN_MS = 1000;

/** per-plane animation state: a true anchor plus the last shown position. */
interface PlaneRecord {
  lat: number;
  lon: number;
  track: number;
  gs: number;
  propsAt: number;
  tweenFromLat: number;
  tweenFromLon: number;
  tweenStart: number;
}

function readId(props: unknown): string | null {
  if (props && typeof props === "object") {
    const raw = (props as Record<string, unknown>)["id"];
    if (typeof raw === "string") return raw;
  }
  return null;
}

function addRow(grid: HTMLElement, label: string, value: string): void {
  const row = document.createElement("div");
  row.className = "flex items-baseline justify-between gap-5";
  const dt = document.createElement("dt");
  dt.className = "font-sans text-xs";
  dt.style.color = "#9AA6BC";
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.className = "font-mono text-xs";
  dd.style.color = "#E6ECF5";
  dd.textContent = value;
  row.appendChild(dt);
  row.appendChild(dd);
  grid.appendChild(row);
}

function buildPopupContent(p: ParticipantState): HTMLElement {
  const live = p.live;
  const root = document.createElement("div");
  root.className = "min-w-[180px]";

  const title = document.createElement("div");
  title.className = "font-mono text-sm font-semibold";
  title.style.color = "#45E0D8";
  title.textContent = live?.callsign || p.flightNumber;
  root.appendChild(title);

  const name = document.createElement("div");
  name.className = "font-sans text-sm";
  name.style.color = "#E6ECF5";
  name.textContent = p.name;
  root.appendChild(name);

  const grid = document.createElement("dl");
  grid.className = "mt-2 flex flex-col gap-1";
  addRow(grid, "type", live?.aircraftType ?? "·");
  addRow(grid, "reg", live?.registration ?? "·");
  addRow(grid, "alt", formatAltFt(live?.altFt));
  addRow(grid, "speed", formatSpeedKt(live?.groundSpeedKt));
  addRow(grid, `to ${p.destination}`, formatDistanceNm(live?.distToDestNm));
  addRow(
    grid,
    "eta",
    live?.etaLocal
      ? `${live.etaLocal} (${formatEtaMinutes(live.etaMinutes)})`
      : "·",
  );
  root.appendChild(grid);

  if (p.slackHandle) {
    const handle = document.createElement("div");
    handle.className = "mt-2 font-sans text-xs";
    handle.style.color = "#8893A8";
    handle.textContent = p.slackHandle;
    root.appendChild(handle);
  }
  return root;
}

/** override maplibre's default white popup chrome to the dark panel palette. */
function stylePopup(popup: Popup): void {
  const el = popup.getElement();
  if (!el) return;
  const content = el.querySelector<HTMLElement>(".maplibregl-popup-content");
  if (content) {
    content.style.background = "#111726";
    content.style.color = "#E6ECF5";
    content.style.border = "1px solid #1E2740";
    content.style.borderRadius = "10px";
    content.style.padding = "10px 12px";
    content.style.boxShadow = "0 10px 34px rgba(0,0,0,0.5)";
  }
  el.querySelectorAll<HTMLElement>(".maplibregl-popup-tip").forEach((tip) => {
    tip.style.borderTopColor = "#111726";
    tip.style.borderBottomColor = "#111726";
  });
  const btn = el.querySelector<HTMLElement>(".maplibregl-popup-close-button");
  if (btn) {
    btn.style.color = "#9AA6BC";
    btn.style.fontSize = "16px";
    btn.style.padding = "2px 7px";
  }
}

export default function MapHero({
  participants,
  airports,
  selectedId,
  onSelectParticipant,
}: MapHeroProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reduced, setReduced] = useState(false);

  // refs the animation loop and event handlers read so they never go stale.
  const participantsRef = useRef<ParticipantState[]>(participants);
  const airportsRef = useRef<AirportsMap>(airports);
  const onSelectRef = useRef(onSelectParticipant);
  const reducedRef = useRef(false);
  const recordsRef = useRef<Map<string, PlaneRecord>>(new Map());
  const hoveredIdRef = useRef<string | null>(null);
  const animRef = useRef<number | null>(null);
  const loopRunningRef = useRef(false);
  const lastTickRef = useRef(0);
  const dashStepRef = useRef(-1);
  const popupRef = useRef<Popup | null>(null);
  const popupIdRef = useRef<string | null>(null);
  const suppressCloseRef = useRef(false);

  onSelectRef.current = onSelectParticipant;

  // ----- position math -----

  function computeDisplay(rec: PlaneRecord, t: number): DisplayPos {
    let lat = rec.lat;
    let lon = rec.lon;
    const elapsedSec = (t - rec.propsAt) / 1000;
    if (rec.gs > 0 && elapsedSec > 0) {
      const distNm = rec.gs * (elapsedSec / 3600);
      const d = destPoint(rec.lat, rec.lon, rec.track, distNm);
      lat = d.lat;
      lon = d.lon;
    }
    const tp = (t - rec.tweenStart) / TWEEN_MS;
    if (tp < 1) {
      const e = 1 - Math.pow(1 - Math.max(0, Math.min(1, tp)), 3);
      lat = rec.tweenFromLat + (lat - rec.tweenFromLat) * e;
      lon = rec.tweenFromLon + (lon - rec.tweenFromLon) * e;
    }
    return { lat, lon, track: rec.track };
  }

  function animatedPositions(t: number): DisplayMap {
    const out: DisplayMap = new Map();
    for (const [id, rec] of recordsRef.current) {
      out.set(id, computeDisplay(rec, t));
    }
    return out;
  }

  function truePositions(list: ParticipantState[]): DisplayMap {
    const out: DisplayMap = new Map();
    for (const p of list) {
      if (p.status === "air" && p.live) {
        out.set(p.id, {
          lat: p.live.lat,
          lon: p.live.lon,
          track: p.live.track ?? 0,
        });
      }
    }
    return out;
  }

  /** carry forward records, capturing the last shown spot for the glide. */
  function reconcile(list: ParticipantState[]): void {
    const now = performance.now();
    const records = recordsRef.current;
    const seen = new Set<string>();
    for (const p of list) {
      if (p.status !== "air" || !p.live) continue;
      seen.add(p.id);
      const track = p.live.track ?? 0;
      const gs = p.live.groundSpeedKt ?? 0;
      const old = records.get(p.id);
      // idempotent: if this record already holds the same live fix, leave its
      // anchor and tween alone so a re-render between polls keeps the dot
      // gliding instead of snapping it back to the last true position.
      if (
        old &&
        old.lat === p.live.lat &&
        old.lon === p.live.lon &&
        old.track === track &&
        old.gs === gs
      ) {
        continue;
      }
      let fromLat = p.live.lat;
      let fromLon = p.live.lon;
      if (old) {
        const d = computeDisplay(old, now);
        fromLat = d.lat;
        fromLon = d.lon;
      }
      records.set(p.id, {
        lat: p.live.lat,
        lon: p.live.lon,
        track,
        gs,
        propsAt: now,
        tweenFromLat: fromLat,
        tweenFromLon: fromLon,
        tweenStart: now,
      });
    }
    for (const id of Array.from(records.keys())) {
      if (!seen.has(id)) records.delete(id);
    }
  }

  function renderFrame(pos: DisplayMap): void {
    const map = mapRef.current;
    if (!map) return;
    setSourceData(
      map,
      SRC.planes,
      buildPlanesData(participantsRef.current, pos),
    );
    setSourceData(
      map,
      SRC.routes,
      buildRoutesData(
        participantsRef.current,
        pos,
        airportsRef.current,
        hoveredIdRef.current,
      ),
    );
  }

  // ----- animation loop -----

  function stopLoop(): void {
    if (animRef.current != null) cancelAnimationFrame(animRef.current);
    animRef.current = null;
    loopRunningRef.current = false;
  }

  function startLoop(): void {
    if (loopRunningRef.current) return;
    loopRunningRef.current = true;
    lastTickRef.current = 0;
    const tick = () => {
      const map = mapRef.current;
      if (!map || reducedRef.current) {
        loopRunningRef.current = false;
        animRef.current = null;
        return;
      }
      animRef.current = requestAnimationFrame(tick);
      const t = performance.now();
      if (t - lastTickRef.current >= MIN_TICK_MS) {
        lastTickRef.current = t;
        renderFrame(animatedPositions(t));
      }
      const step = Math.floor((t / DASH_SPEED_MS) % DASH_SEQ.length);
      if (step !== dashStepRef.current) {
        dashStepRef.current = step;
        const d = DASH_SEQ[step];
        if (d && map.getLayer(LYR.routeLine)) {
          map.setPaintProperty(LYR.routeLine, "line-dasharray", d);
        }
      }
    };
    animRef.current = requestAnimationFrame(tick);
  }

  /** apply new props: feed the static airport source and (re)drive motion. */
  function apply(list: ParticipantState[], ap: AirportsMap): void {
    const map = mapRef.current;
    if (!map) return;
    participantsRef.current = list;
    airportsRef.current = ap;
    setSourceData(map, SRC.airports, buildAirportsData(ap));

    const anyAir = list.some((p) => p.status === "air" && p.live);
    if (reducedRef.current || !anyAir) {
      stopLoop();
      renderFrame(truePositions(list));
    } else {
      reconcile(list);
      renderFrame(animatedPositions(performance.now()));
      startLoop();
    }
  }

  // ----- popups -----

  function closePopup(): void {
    if (popupRef.current) {
      suppressCloseRef.current = true;
      popupRef.current.remove();
      popupRef.current = null;
      suppressCloseRef.current = false;
    }
    popupIdRef.current = null;
  }

  function openPopupFor(id: string, lon: number, lat: number): void {
    const map = mapRef.current;
    if (!map) return;
    const p = participantsRef.current.find((x) => x.id === id);
    if (!p || !p.live) return;
    if (popupIdRef.current === id && popupRef.current) {
      popupRef.current.setLngLat([lon, lat]);
      return;
    }
    closePopup();
    const popup = new Popup({
      closeButton: true,
      closeOnClick: false,
      maxWidth: "280px",
      offset: 14,
      className: "fa-map-popup",
    });
    popup.setLngLat([lon, lat]).setDOMContent(buildPopupContent(p)).addTo(map);
    stylePopup(popup);
    popup.on("close", () => {
      if (suppressCloseRef.current) return;
      popupRef.current = null;
      popupIdRef.current = null;
      onSelectRef.current(null);
    });
    popupRef.current = popup;
    popupIdRef.current = id;
  }

  function setHover(id: string | null): void {
    if (hoveredIdRef.current === id) return;
    hoveredIdRef.current = id;
    const map = mapRef.current;
    if (!map) return;
    const pos = reducedRef.current
      ? truePositions(participantsRef.current)
      : animatedPositions(performance.now());
    setSourceData(
      map,
      SRC.routes,
      buildRoutesData(participantsRef.current, pos, airportsRef.current, id),
    );
  }

  // ----- reduced motion -----

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reducedRef.current = mq.matches;
      setReduced(mq.matches);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // ----- map init (once) -----

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = new MlMap({
      container: containerRef.current,
      style: buildMapStyle(MAPTILER_KEY),
      center: MAP_DEFAULT_CENTER,
      zoom: MAP_DEFAULT_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(
      new NavigationControl({ showCompass: true, visualizePitch: false }),
      "top-right",
    );

    // idempotent so it is safe to run on the first style load and again after a
    // fallback restyle (see onError below).
    const ensureLayers = () => {
      if (!map.getSource(SRC.airports)) addSourcesAndLayers(map);
      setLoaded(true);
    };
    map.on("load", ensureLayers);

    // a bad, expired, or over-quota maptiler key fails the style fetch, so the
    // map never fires "load" and the hero would sit blank. swap to the keyless
    // blank style once so the rings, airports, and planes still render. only a
    // real style-load failure trips this (isStyleLoaded stays false); routine
    // tile errors after the style is up are ignored.
    let recovered = false;
    const onError = () => {
      if (recovered || !MAPTILER_KEY || map.isStyleLoaded()) return;
      recovered = true;
      map.setStyle(buildMapStyle(""));
      map.once("idle", ensureLayers);
    };
    map.on("error", onError);

    const onPlaneClick = (e: MapLayerMouseEvent) => {
      const f = e.features && e.features[0];
      const id = readId(f?.properties);
      if (!id) return;
      // open the popup straight away so a click works on its own; if the parent
      // echoes selectedId back, the selection effect just reuses this popup.
      const p = participantsRef.current.find((x) => x.id === id);
      if (p && p.live) {
        const rec = recordsRef.current.get(id);
        const pos =
          rec && !reducedRef.current
            ? computeDisplay(rec, performance.now())
            : { lat: p.live.lat, lon: p.live.lon };
        openPopupFor(id, pos.lon, pos.lat);
      }
      onSelectRef.current(id);
    };
    const onPlaneHover = (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features && e.features[0];
      setHover(readId(f?.properties));
    };
    const onPlaneLeave = () => {
      map.getCanvas().style.cursor = "";
      setHover(null);
    };

    // one shared hit area: the arrowhead plus its soft glow. passing both ids
    // as an array dedupes the event so click fires once, and hover reacts to
    // the same area click does.
    const planeHit = [LYR.planes, LYR.planeGlow];
    map.on("click", planeHit, onPlaneClick);
    map.on("mouseenter", planeHit, onPlaneHover);
    map.on("mousemove", planeHit, onPlaneHover);
    map.on("mouseleave", planeHit, onPlaneLeave);

    return () => {
      stopLoop();
      closePopup();
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- drive layers from props -----

  useEffect(() => {
    if (!loaded) return;
    apply(participants, airports);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, participants, airports, reduced]);

  // ----- react to external selection -----

  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current;
    if (!map) return;
    if (selectedId == null) {
      closePopup();
      return;
    }
    const p = participantsRef.current.find((x) => x.id === selectedId);
    if (!p || p.status !== "air" || !p.live) {
      closePopup();
      return;
    }
    const rec = recordsRef.current.get(p.id);
    const pos =
      rec && !reducedRef.current
        ? computeDisplay(rec, performance.now())
        : { lat: p.live.lat, lon: p.live.lon, track: p.live.track ?? 0 };
    const target: [number, number] = [pos.lon, pos.lat];
    const zoom = Math.max(map.getZoom(), 7.2);
    if (reducedRef.current) {
      map.jumpTo({ center: target, zoom });
    } else {
      map.flyTo({ center: target, zoom, speed: 0.9, essential: true });
    }
    openPopupFor(p.id, pos.lon, pos.lat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, selectedId]);

  const airborneCount = participants.filter(
    (p) => p.status === "air" && p.live,
  ).length;

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="region"
        aria-label="live flight map. airborne cohort planes converging on hong kong and shenzhen, with range rings around the pearl river delta."
      />
      {airborneCount === 0 && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-line bg-panel/90 px-3 py-1.5 font-mono text-xs text-muted shadow-lg backdrop-blur-sm"
        >
          nobody&apos;s airborne right now. the board has who&apos;s up next.
        </div>
      )}
    </div>
  );
}
