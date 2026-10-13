import type { NextConfig } from "next";

// The UI calls /api/... on its own origin. The assistant (/api/query/stream)
// is a route handler here; the catalogue and tutorials still come from the
// mock server, so those three paths are forwarded to it. The mock server
// already strips a leading /api, so either shape of destination works.
const CATALOG_API_URL = process.env.CATALOG_API_URL || "http://localhost:8009";

const nextConfig: NextConfig = {
  // Product photos are plain <img> tags pointing at whichever supplier host
  // the scraper found them on, so there is no allowlist to maintain and
  // nothing for the image optimiser to do.
  images: { unoptimized: true },

  // Next 16 writes an AGENTS.md and CLAUDE.md into this folder on first boot.
  // The repository root already has the real CLAUDE.md; a second one here
  // would be picked up as project instructions and would say nothing true
  // about the scraper or the mock server.
  agentRules: false,

  // Hide the dev-mode "Compiling..." pill in the bottom corner.
  devIndicators: false,

  async rewrites() {
    return ["catalog", "tutorials", "health"].map((route) => ({
      source: `/api/${route}`,
      destination: `${CATALOG_API_URL}/${route}`,
    }));
  },
};

export default nextConfig;
