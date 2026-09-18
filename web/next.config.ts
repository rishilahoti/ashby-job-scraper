import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  // Repo root also has a package-lock.json (scraper package), and web/lib/query.ts
  // reaches outside this dir into ../../src/config/rules.json — the real workspace
  // root is one level up, not this directory.
  turbopack: { root: path.join(__dirname, "..") },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
