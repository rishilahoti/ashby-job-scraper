import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Repo root also has a package-lock.json (scraper package), and web/lib/query.ts
// reaches outside this dir into ../../src/config/rules.json — the real workspace
// root is one level up, not this directory.
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  // The Docker image (web/Dockerfile) runs Next's standalone server. web/ imports ../src, so
  // file tracing has to start at the repo root or those files are left out of the image.
  ...(process.env.DOCKER_BUILD === "1" && { output: "standalone", outputFileTracingRoot: repoRoot }),
  serverExternalPackages: ["pg"],
  // Next writes every rendered page and data-cache entry to disk inside the container and
  // never evicts them: 5.6 GB after one month (2026-11), on a 45 GB disk shared with the
  // database. Cloudflare already caches pages at the edge, so the bounded 50 MB in-memory
  // cache is enough. Pages prerendered at build time are still read from disk.
  experimental: { isrFlushToDisk: false },
  turbopack: { root: repoRoot },
  // The site moved to jobs.whatrunsindia.com. Once this ships, the old Vercel address sends
  // every page there with a permanent redirect (308, path and query kept). robots.txt and
  // sitemap.xml stay on the old host on purpose: crawlers need them to find the old URLs and
  // watch them move. The host condition means the rule never fires on the new site.
  async redirects() {
    return [
      // The generated icon and share-image routes became static files; old links and cached
      // social cards still ask for the old paths (with a hash query), on either host.
      { source: "/icon", destination: "/icon.png", permanent: true },
      { source: "/apple-icon", destination: "/apple-icon.png", permanent: true },
      { source: "/opengraph-image", destination: "/og.png", permanent: true },
      {
        source: "/:path((?!robots\\.txt$|sitemap\\.xml$).*)",
        has: [{ type: "host" as const, value: "ashbyhq-scraper\\.vercel\\.app" }],
        destination: "https://jobs.whatrunsindia.com/:path",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
