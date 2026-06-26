import type { NextConfig } from "next";
import { securityHeaders } from "./lib/securityHeaders";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // every route gets the security headers (see lib/securityHeaders.ts). in dev
  // we drop just the csp so next's hmr (eval sourcemaps, ws) keeps working; the
  // deployed app always runs the production build, so it always gets the full
  // policy.
  async headers() {
    const all = securityHeaders();
    const headers =
      process.env.NODE_ENV === "production"
        ? all
        : all.filter((h) => h.key !== "Content-Security-Policy");
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
