import type { Config } from "tailwindcss";

// design tokens from SPEC section 9. night flight-ops board:
// sodium-amber and radar-cyan on midnight indigo.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0A0E1A",
        panel: "#111726",
        "panel-2": "#0F1422",
        line: "#1E2740",
        amber: "#F5A623",
        "amber-bright": "#FFB000",
        cyan: "#45E0D8",
        jade: "#46C08D",
        coral: "#FF6B5B",
        text: "#E6ECF5",
        muted: "#8893A8",
      },
      fontFamily: {
        display: ["var(--font-saira)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
