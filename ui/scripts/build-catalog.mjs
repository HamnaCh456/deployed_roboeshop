/**
 * Bakes the scraper's output into ui/data/ so the deployed app can serve the
 * catalogue from its own route handlers, with no mock server to host.
 *
 *   node scripts/build-catalog.mjs
 *
 * Reads scraper/data/robots.json (one row per listing per site, ~26 MB) and
 * writes ui/data/catalog.json: one card per product, listings grouped by
 * match_key, cheapest seller first. This is the same grouping loadRobots()
 * does in mock-server/server.js; keep the two in step. Re-run after a crawl.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SCRAPER_DATA = join(here, "..", "..", "scraper", "data");
const OUT = join(here, "..", "data");

/** Same hard-coded rate as the mock server: for filtering and sorting only. */
const RATE_TO_PKR = { PKR: 1, USD: 280 };
const toPkr = (price, currency) => price * (RATE_TO_PKR[currency] || 1);
const titleCase = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : null);

function imageFor(row) {
  const images = row.images || [];
  const primary = images.find((i) => i.url === row.primary_image) || images[0];
  if (primary && primary.local_path) return primary.local_path;
  return row.primary_image || "";
}

function group(rows) {
  rows = rows.filter((row) => row.name && typeof row.price === "number");
  const byKey = new Map();
  for (const row of rows) {
    const key = row.match_key || row.source_url;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }

  const seen = new Set();
  const catalogue = [];
  for (const row of rows) {
    const key = row.match_key || row.source_url;
    if (seen.has(key)) continue;
    seen.add(key);

    const listings = byKey.get(key);
    const sellers = listings
      .map((l) => ({
        name: l.seller_name || l.source_site,
        price: l.price,
        currency: l.currency || "PKR",
        pricePkr: toPkr(l.price, l.currency || "PKR"),
        verified: l.seller_verified === true,
        url: l.source_url,
      }))
      .sort((a, b) => a.pricePkr - b.pricePkr);

    catalogue.push({
      id: key,
      name: row.name,
      brand: row.brand || row.vendor || row.source_site,
      category: row.category || "Uncategorised",
      subcategory: row.subcategory || null,
      summary: row.summary || row.description_text || "",
      image: imageFor(row),
      price: sellers[0].price,
      currency: sellers[0].currency,
      pricePkr: sellers[0].pricePkr,
      offerCount: sellers.length,
      hasVerifiedSeller: sellers.some((s) => s.verified),
      sellers,
      ageMin: row.age_min ?? undefined,
      ageMax: row.age_max ?? undefined,
      skill: titleCase(row.skill_level) || "Intermediate",
      useCase: (row.use_case || []).join(" "),
      platforms: row.supported_platforms || [],
      languages: row.programming_languages || [],
      os: row.supported_os || [],
      ros: row.ros_support ? row.ros_version || "ROS" : null,
      dof: row.degrees_of_freedom ?? undefined,
      tutorials: (row.tutorial_videos || []).length,
      inStock: listings.some((l) => l.in_stock === true),
      sourceUrl: row.source_url,
    });
  }
  return catalogue;
}

mkdirSync(OUT, { recursive: true });

const robots = group(JSON.parse(readFileSync(join(SCRAPER_DATA, "robots.json"), "utf8")));
writeFileSync(join(OUT, "catalog.json"), JSON.stringify(robots));

const tutorialsPath = join(SCRAPER_DATA, "tutorials.json");
const tutorials = existsSync(tutorialsPath) ? JSON.parse(readFileSync(tutorialsPath, "utf8")) : [];
writeFileSync(join(OUT, "tutorials.json"), JSON.stringify(Array.isArray(tutorials) ? tutorials : []));

console.log(`Wrote ${robots.length} products and ${tutorials.length} tutorials to ${OUT}`);
