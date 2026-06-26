import { ImageResponse } from "next/og";

// rely on the built-in default font only. no external/custom font fetch, so
// this never fails offline.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "fallout arrivals live flight board";

const BG = "#0A0E1A";
const AMBER = "#F5A623";
const CYAN = "#45E0D8";
const TEXT = "#E6ECF5";
const MUTED = "#8893A8";

// concentric radar range-ring centered on a point. drawn with a bordered,
// rounded div so satori's flexbox subset can render it.
function Ring({
  diameter,
  color,
  opacity,
}: {
  diameter: number;
  color: string;
  opacity: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        width: diameter,
        height: diameter,
        borderRadius: diameter,
        border: `2px solid ${color}`,
        opacity,
      }}
    />
  );
}

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: BG,
        padding: 72,
        position: "relative",
        overflow: "hidden",
        fontFamily: "sans-serif",
        color: TEXT,
      }}
    >
      {/* radar range-ring motif, anchored off the right edge */}
      <div
        style={{
          position: "absolute",
          top: 315,
          left: 1080,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: "translate(-50%, -50%)",
        }}
      >
        <Ring diameter={760} color={AMBER} opacity={0.1} />
        <Ring diameter={540} color={AMBER} opacity={0.16} />
        <Ring diameter={340} color={AMBER} opacity={0.24} />
        <Ring diameter={160} color={CYAN} opacity={0.55} />
        <div
          style={{
            position: "absolute",
            width: 18,
            height: 18,
            borderRadius: 18,
            backgroundColor: CYAN,
          }}
        />
      </div>

      {/* top kicker */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 24,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: AMBER,
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 14,
            backgroundColor: CYAN,
          }}
        />
        <div style={{ display: "flex" }}>live flight board</div>
      </div>

      {/* title + subtitle */}
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 24,
            fontSize: 120,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1,
          }}
        >
          <div style={{ display: "flex", color: AMBER }}>FALLOUT</div>
          <div style={{ display: "flex", color: CYAN }}>{"//"}</div>
          <div style={{ display: "flex", color: TEXT }}>ARRIVALS</div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 38,
            color: MUTED,
            maxWidth: 820,
          }}
        >
          watch the cohort land in shenzhen + hong kong
        </div>
      </div>

      {/* footer attribution */}
      <div
        style={{
          display: "flex",
          fontSize: 22,
          color: MUTED,
          letterSpacing: 1,
        }}
      >
        data: adsb.lol + airplanes.live
      </div>
    </div>,
    { ...size },
  );
}
