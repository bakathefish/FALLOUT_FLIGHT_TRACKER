import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fallout Arrivals",
    short_name: "Arrivals",
    description:
      "live board watching the fallout cohort's flights converge on shenzhen and hong kong.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0E1A",
    theme_color: "#0A0E1A",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
      },
    ],
  };
}
