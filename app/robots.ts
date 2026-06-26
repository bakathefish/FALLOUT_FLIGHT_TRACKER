import type { MetadataRoute } from "next";

// crawlers are allowed by default. to keep the board out of search results,
// change `allow` to `disallow` below. that is the only change needed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
  };
}
