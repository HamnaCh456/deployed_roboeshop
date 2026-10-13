import type { NextConfig } from "next";

// The UI calls /api/... on its own origin, and every one of those is a route
// handler in this app: the assistant (/api/query/stream) and the catalogue,
// tutorials and health routes, which read ui/data/ via src/server/catalog.ts.
// Nothing is forwarded to the mock server any more, so a deploy is one app.

const nextConfig: NextConfig = {
  // The catalogue routes read ui/data/*.json at runtime with fs, which the
  // bundler cannot see; include the folder in every API function explicitly.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**"],
  },

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
};

export default nextConfig;
