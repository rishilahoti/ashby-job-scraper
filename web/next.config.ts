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
  // Pin to this directory — the Docker build context includes the repo root
  // (for the sibling ../../src import in lib/scoring.ts), which gives Next
  // two lockfiles to see and would otherwise make it guess the wrong
  // monorepo root and mangle the standalone output paths.
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
