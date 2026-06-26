import type { StyleSpecification } from "maplibre-gl";

// the map style. with a maptiler key we load the dataviz-dark vector style.
// without one we fall back to a blank dark style so the rings, airports, and
// planes always render and the hero never looks broken. the demotiles glyph
// endpoint gives us fonts for the labels even with no key.

const BLANK_GLYPHS =
  "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

export function buildMapStyle(
  maptilerKey: string,
): string | StyleSpecification {
  if (maptilerKey) {
    return `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${maptilerKey}`;
  }
  const blank: StyleSpecification = {
    version: 8,
    name: "fallout-blank",
    glyphs: BLANK_GLYPHS,
    sources: {},
    layers: [
      {
        id: "fa-bg",
        type: "background",
        paint: { "background-color": "#0A0E1A" },
      },
    ],
  };
  return blank;
}
