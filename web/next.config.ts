import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // lib/scoring.ts imports ../../src/* (shared with the scraper, outside this
  // directory) — Turbopack refuses to resolve modules outside its detected
  // root, so both root settings must point at the repo root (Next requires
  // outputFileTracingRoot and turbopack.root to match). Standalone output
  // then nests under .next/standalone/web/ instead of .next/standalone/ —
  // see web/Dockerfile's runner stage for the matching copy paths.
  outputFileTracingRoot: path.join(__dirname, ".."),
  turbopack: {
    root: path.join(__dirname, ".."),
  },
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
