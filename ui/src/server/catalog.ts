/**
 * The catalogue backend, in-process. A port of mock-server/server.js so the
 * deployed app needs nothing but Vercel: the route handlers under
 * src/app/api/{catalog,tutorials,health} and the assistant's tools all call
 * buildCatalog() here instead of a separate server.
 *
 * Data comes from ui/data/, written by `node scripts/build-catalog.mjs` from
 * the scraper's output. Re-run that after a crawl. next.config.ts traces the
 * folder into the serverless bundle. Keep the filtering below in step with
 * the mock server, which still exists for anyone running it locally.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  pricePkr: number;
  offerCount: number;
  skill: string;
  platforms: string[];
  inStock: boolean;
  [key: string]: unknown;
};

const DATA_DIR = join(process.cwd(), "data");

let robots: Product[] | null = null;
let tutorials: unknown[] | null = null;

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) as T;
  } catch (err) {
    console.warn(`[catalog] could not read data/${file}: ${String(err)}`);
    return fallback;
  }
}

/** Parsed once per server instance, then reused across requests. */
export function getRobots(): Product[] {
  if (!robots) robots = readJson<Product[]>("catalog.json", []);
  return robots;
}

export function getTutorials(): unknown[] {
  if (!tutorials) tutorials = readJson<unknown[]>("tutorials.json", []);
  return tutorials;
}

export function health() {
  const all = getRobots();
  return {
    status: "ok",
    robots: all.length,
    tutorials: getTutorials().length,
    multiSeller: all.filter((r) => r.offerCount > 1).length,
  };
}

/** 4 columns x 12 rows, matching the reference catalogue layout. */
const CATALOG_PAGE_SIZE = 48;

/** Fixed bands: prices run Rs 1 to Rs 1.2m with a median near Rs 2,000. */
const PRICE_BANDS = [
  { value: "under-500", label: "Under Rs 500", min: null, max: 500 },
  { value: "500-2000", label: "Rs 500 – 2,000", min: 500, max: 2000 },
  { value: "2000-10000", label: "Rs 2,000 – 10,000", min: 2000, max: 10000 },
  { value: "10000-50000", label: "Rs 10,000 – 50,000", min: 10000, max: 50000 },
  { value: "over-50000", label: "Over Rs 50,000", min: 50000, max: null },
] as const;

type Band = (typeof PRICE_BANDS)[number];

type Filters = {
  category: string[] | null;
  platform: string[] | null;
  skill: string[] | null;
  price: string[] | null;
  minPrice: number | null;
  maxPrice: number | null;
  inStock: true | null;
  q: string | null;
};

/** Repeatable params: ?category=Sensors&category=Power, or ?category=a,b. */
function multiParam(params: URLSearchParams, key: string): string[] | null {
  const values = params
    .getAll(key)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length > 0 ? values : null;
}

function parseCatalogQuery(params: URLSearchParams): Filters {
  const num = (key: string) => {
    const raw = params.get(key);
    if (raw === null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    category: multiParam(params, "category"),
    platform: multiParam(params, "platform"),
    skill: multiParam(params, "skill"),
    price: multiParam(params, "price"),
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    inStock: params.get("inStock") === "true" ? true : null,
    q: (params.get("q") || "").trim().toLowerCase() || null,
  };
}

function inBand(pricePkr: number, band: Band) {
  if (band.min !== null && pricePkr < band.min) return false;
  if (band.max !== null && pricePkr > band.max) return false;
  return true;
}

/**
 * `except` leaves one facet group out of the test, so each group is counted
 * against all the *other* filters and ticking one category does not zero the rest.
 */
function matchesCatalog(r: Product, f: Filters, except: string | null) {
  if (except !== "category" && f.category && !f.category.includes(r.category)) return false;
  if (except !== "platform" && f.platform && !f.platform.some((p) => r.platforms.includes(p))) return false;
  if (except !== "skill" && f.skill && !f.skill.includes(r.skill)) return false;
  if (except !== "price" && f.minPrice !== null && r.pricePkr < f.minPrice) return false;
  if (except !== "price" && f.maxPrice !== null && r.pricePkr > f.maxPrice) return false;
  if (except !== "price" && f.price) {
    const bands = PRICE_BANDS.filter((b) => f.price!.includes(b.value));
    if (bands.length > 0 && !bands.some((b) => inBand(r.pricePkr, b))) return false;
  }
  if (except !== "inStock" && f.inStock && !r.inStock) return false;
  if (f.q && !`${r.name} ${r.brand} ${r.category}`.toLowerCase().includes(f.q)) return false;
  return true;
}

function countBy(pool: Product[], valuesOf: (r: Product) => string[]) {
  const counts = new Map<string, number>();
  for (const r of pool) {
    for (const value of valuesOf(r)) {
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

export function buildCatalog(params: URLSearchParams) {
  const all = getRobots();
  const filters = parseCatalogQuery(params);
  const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const sort = params.get("sort") || "featured";

  const matched = all.filter((r) => matchesCatalog(r, filters, null));

  const sorted = [...matched];
  if (sort === "price-asc") sorted.sort((a, b) => a.pricePkr - b.pricePkr);
  else if (sort === "price-desc") sorted.sort((a, b) => b.pricePkr - a.pricePkr);
  else if (sort === "name-asc") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "name-desc") sorted.sort((a, b) => b.name.localeCompare(a.name));
  else if (sort === "sellers-desc") sorted.sort((a, b) => b.offerCount - a.offerCount);

  const start = (page - 1) * CATALOG_PAGE_SIZE;
  const priceable = all.filter((r) => matchesCatalog(r, filters, "price")).map((r) => r.pricePkr);

  return {
    total: matched.length,
    page,
    pageSize: CATALOG_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(matched.length / CATALOG_PAGE_SIZE)),
    sort,
    filters,
    products: sorted.slice(start, start + CATALOG_PAGE_SIZE),
    facets: {
      category: countBy(all.filter((r) => matchesCatalog(r, filters, "category")), (r) => [r.category]),
      platform: countBy(all.filter((r) => matchesCatalog(r, filters, "platform")), (r) => r.platforms),
      skill: countBy(all.filter((r) => matchesCatalog(r, filters, "skill")), (r) => [r.skill]),
      inStock: all.filter((r) => matchesCatalog(r, filters, "inStock") && r.inStock).length,
      price: PRICE_BANDS.map((b) => ({
        value: b.value,
        label: b.label,
        count: priceable.filter((p) => inBand(p, b)).length,
      })),
      priceRange: {
        min: priceable.length ? Math.floor(Math.min(...priceable)) : 0,
        max: priceable.length ? Math.ceil(Math.max(...priceable)) : 0,
      },
    },
  };
}

/**
 * A fetch the assistant's tools can use in place of the network: they build
 * `${baseUrl}/catalog?...` URLs, and this answers them from buildCatalog()
 * directly. Avoids a serverless function calling its own public URL.
 */
export const LOCAL_CATALOG_BASE = "http://catalog.local";

export async function localCatalogFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const path = url.pathname.replace(/^\/api/, "");
  if (path.startsWith("/catalog")) return Response.json(buildCatalog(url.searchParams));
  if (path.startsWith("/tutorials")) {
    const list = getTutorials();
    return Response.json({ tutorials: list, count: list.length });
  }
  if (path.startsWith("/health")) return Response.json(health());
  return Response.json({ error: `No route for ${path}` }, { status: 404 });
}
