"use client";

import { Fragment } from "react";
import type { AttributionProps } from "@/lib/uiContracts";

// always-visible footer credit. adsb.lol is odbl licensed, so the attribution
// string from lib/adsb has to stay on screen. it is the single source of truth,
// rendered small and quiet, with the source names linked out (links carry
// enough contrast to stay readable).

const SOURCE_LINKS: Record<string, string> = {
  "adsb.lol": "https://adsb.lol",
  "airplanes.live": "https://airplanes.live",
};

// splits the attribution string on the known source names, keeping them as
// their own pieces so each becomes a link while the surrounding text stays plain.
const SOURCE_PATTERN = /(adsb\.lol|airplanes\.live)/g;

export default function Attribution({ attribution }: AttributionProps) {
  const parts = attribution.split(SOURCE_PATTERN);
  return (
    <footer className="border-t border-line bg-panel-2 px-4 py-2 text-center text-[11px] leading-relaxed text-muted md:text-left">
      <p>
        {parts.map((part, i) => {
          const href = SOURCE_LINKS[part];
          if (href) {
            return (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-cyan underline hover:text-amber-bright"
              >
                {part}
              </a>
            );
          }
          return <Fragment key={i}>{part}</Fragment>;
        })}
      </p>
    </footer>
  );
}
