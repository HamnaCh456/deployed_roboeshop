/**
 * Mock catalogue server for the RobotEshop UI.
 *
 * Serves the scraper's output over HTTP until the PostgreSQL backend from the
 * proposal exists. The assistant used to live here as a set of regex rules;
 * it is now a Next.js route handler in ui/src/app/api/query/stream/route.ts
 * that calls GET /catalog below as a tool.
 *
 *   GET  /catalog       -> paginated browse: {total, page, products, facets}
 *                          ?category=&platform=&skill= repeat for multi-select
 *                          ?minPrice=&maxPrice=&inStock=&q=&sort=&page=
 *   GET  /tutorials     -> {count, tutorials:[{...}]} — the whole library, no paging.
 *                          Built by scraper/run_tutorials.py from archived
 *                          RobotShop Community pages; empty until that is run.
 *   GET  /health        -> {status:"ok", robots, tutorials, multiSeller}
 *
 * No dependencies: Node's built-in http/fs only.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8009;
const IMAGE_DIR = path.join(__dirname, '..', 'ui', 'public', 'images', 'robots');

// ---------------------------------------------------------------- catalogue

const CATALOGUE_PATH = path.join(__dirname, '..', 'scraper', 'data', 'robots.json');

/**
 * Not every source quotes in rupees — shop.unitree.com lists in USD. Prices are
 * shown in the currency the seller actually quoted, and this rate is used only
 * to put listings on a common axis for filtering, sorting, and "cheapest
 * seller". It is a hard-coded assumption, not a live rate: update it, or move
 * conversion into the scraper, before anyone treats these totals as accurate.
 */
const RATE_TO_PKR = { PKR: 1, USD: 280 };

function toPkr(price, currency) {
  return price * (RATE_TO_PKR[currency] || 1);
}

function titleCase(value) {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Local file for a listing's primary photo, falling back to the remote URL. */
function imageFor(row) {
  const images = row.images || [];
  const primary = images.find((i) => i.url === row.primary_image) || images[0];
  if (primary && primary.local_path) return primary.local_path;
  return row.primary_image || '';
}

/**
 * Reads the real scraped catalogue produced by scraper/run.py.
 *
 * One row is one listing on one site, so `match_key` is what groups the same
 * physical product across sites into a price comparison. See
 * scraper/robotshop/models.py for the full record.
 */
function loadRobots() {
  const rows = JSON.parse(fs.readFileSync(CATALOGUE_PATH, 'utf8'))
    .filter((row) => row.name && typeof row.price === 'number');

  // Group listings that describe the same product.
  const byMatchKey = new Map();
  for (const row of rows) {
    const key = row.match_key || row.source_url;
    if (!byMatchKey.has(key)) byMatchKey.set(key, []);
    byMatchKey.get(key).push(row);
  }

  const seen = new Set();
  const catalogue = [];

  for (const row of rows) {
    const key = row.match_key || row.source_url;
    if (seen.has(key)) continue;
    seen.add(key);

    const listings = byMatchKey.get(key);
    const sellers = listings
      .map((l) => ({
        name: l.seller_name || l.source_site,
        price: l.price,
        currency: l.currency || 'PKR',
        pricePkr: toPkr(l.price, l.currency || 'PKR'),
        // The scraper does not yet establish authorised-distributor status, so
        // this is null across the board. Rendering it as false rather than
        // inventing a badge keeps the UI honest.
        verified: l.seller_verified === true,
        url: l.source_url,
      }))
      // Cheapest first, compared on a common currency.
      .sort((a, b) => a.pricePkr - b.pricePkr);

    catalogue.push({
      id: key,
      name: row.name,
      brand: row.brand || row.vendor || row.source_site,
      category: row.category || 'Uncategorised',
      subcategory: row.subcategory || null,
      summary: row.summary || row.description_text || '',
      image: imageFor(row),
      price: sellers[0].price,
      currency: sellers[0].currency,
      // Common-currency value, used for filtering and ranking only.
      pricePkr: sellers[0].pricePkr,
      offerCount: sellers.length,
      hasVerifiedSeller: sellers.some((s) => s.verified),
      sellers,
      ageMin: row.age_min ?? undefined,
      ageMax: row.age_max ?? undefined,
      skill: titleCase(row.skill_level) || 'Intermediate',
      useCase: (row.use_case || []).join(' '),
      platforms: row.supported_platforms || [],
      languages: row.programming_languages || [],
      os: row.supported_os || [],
      ros: row.ros_support ? (row.ros_version || 'ROS') : null,
      dof: row.degrees_of_freedom ?? undefined,
      tutorials: (row.tutorial_videos || []).length,
      // 92% populated. True if any seller has it, since the shopper only needs
      // one of them to actually have stock.
      inStock: listings.some((l) => l.in_stock === true),
      sourceUrl: row.source_url,
    });
  }

  return catalogue;
}

const ROBOTS = loadRobots();
const MULTI_SELLER = ROBOTS.filter((r) => r.offerCount > 1).length;
console.log(`Loaded ${ROBOTS.length} products from ${path.relative(process.cwd(), CATALOGUE_PATH)}`);
console.log(`Categories: ${[...new Set(ROBOTS.map((r) => r.category))].join(', ')}`);

// ---------------------------------------------------------------- tutorials

const TUTORIALS_PATH = path.join(__dirname, '..', 'scraper', 'data', 'tutorials.json');

/**
 * Tutorials are optional, unlike the catalogue.
 *
 * A missing `robots.json` is fatal — without it there is no product data and
 * nothing to serve. A missing `tutorials.json` only means `run_tutorials.py`
 * has not been run yet, so the server starts, says so once, and `/tutorials`
 * answers with an empty list. The page then renders its own empty state naming
 * the command to run, which is more useful than a server that refuses to boot.
 *
 * The file is already in the exact shape `ui/src/types/index.ts` declares, so
 * there is no mapping layer here on purpose — see `tutorials/models.py`.
 */
function loadTutorials() {
  try {
    const rows = JSON.parse(fs.readFileSync(TUTORIALS_PATH, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`Could not read ${TUTORIALS_PATH}: ${err.message}`);
    }
    return [];
  }
}

const TUTORIAL_LIBRARY = loadTutorials();
if (TUTORIAL_LIBRARY.length) {
  const priced = TUTORIAL_LIBRARY.filter((t) => (t.parts || []).length).length;
  console.log(
    `Loaded ${TUTORIAL_LIBRARY.length} tutorials (${priced} with a priced parts list) ` +
      `from ${path.relative(process.cwd(), TUTORIALS_PATH)}`
  );
} else {
  console.log('No tutorials loaded — run `cd scraper && python run_tutorials.py`');
}

// ------------------------------------------------------- catalogue browsing
//
// The chat path above is single-valued by nature: a question says "Arduino" or
// it does not. Browsing is not — a shopper ticks Sensors AND Power — so
// multi-select gets its own pair of functions rather than a rewrite of
// applyFilters(), which would change how chat search behaves.

/** 4 columns x 12 rows, matching the reference catalogue layout. */
const CATALOG_PAGE_SIZE = 48;

/** Repeatable params: ?category=Sensors&category=Power, or ?category=a,b. */
function multiParam(params, key) {
  const values = params
    .getAll(key)
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length > 0 ? values : null;
}

function parseCatalogQuery(params) {
  const num = (key) => {
    const raw = params.get(key);
    if (raw === null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  return {
    category: multiParam(params, 'category'),
    platform: multiParam(params, 'platform'),
    skill: multiParam(params, 'skill'),
    price: multiParam(params, 'price'),
    minPrice: num('minPrice'),
    maxPrice: num('maxPrice'),
    inStock: params.get('inStock') === 'true' ? true : null,
    q: (params.get('q') || '').trim().toLowerCase() || null,
  };
}

/**
 * `except` names one facet group to leave out of the test.
 *
 * Counting a facet with its own selection applied is the classic faceted-search
 * bug: tick one category and every other category reads 0, so the shopper can
 * no longer see what else exists. Counting each group against all the *other*
 * filters keeps the alternatives visible.
 */
function matchesCatalog(r, f, except) {
  if (except !== 'category' && f.category && !f.category.includes(r.category)) return false;
  if (except !== 'platform' && f.platform && !f.platform.some((p) => r.platforms.includes(p))) return false;
  if (except !== 'skill' && f.skill && !f.skill.includes(r.skill)) return false;
  if (except !== 'price' && f.minPrice !== null && r.pricePkr < f.minPrice) return false;
  if (except !== 'price' && f.maxPrice !== null && r.pricePkr > f.maxPrice) return false;
  if (except !== 'price' && f.price) {
    // Bands are OR'd against each other, like every other multi-select group.
    const bands = PRICE_BANDS.filter((b) => f.price.includes(b.value));
    if (bands.length > 0 && !bands.some((b) => inBand(r.pricePkr, b))) return false;
  }
  if (except !== 'inStock' && f.inStock && !r.inStock) return false;
  if (f.q && !`${r.name} ${r.brand} ${r.category}`.toLowerCase().includes(f.q)) return false;
  return true;
}

/**
 * Prices run from Rs 1 to Rs 1.2m with a median of Rs 2,000, so a linear slider
 * would spend 99% of its travel on 1% of the catalogue. Fixed bands, counted
 * like any other facet, are both usable and honest about the distribution.
 */
const PRICE_BANDS = [
  { value: 'under-500', label: 'Under Rs 500', min: null, max: 500 },
  { value: '500-2000', label: 'Rs 500 – 2,000', min: 500, max: 2000 },
  { value: '2000-10000', label: 'Rs 2,000 – 10,000', min: 2000, max: 10000 },
  { value: '10000-50000', label: 'Rs 10,000 – 50,000', min: 10000, max: 50000 },
  { value: 'over-50000', label: 'Over Rs 50,000', min: 50000, max: null },
];

function inBand(pricePkr, band) {
  if (band.min !== null && pricePkr < band.min) return false;
  if (band.max !== null && pricePkr > band.max) return false;
  return true;
}

function countBy(pool, valuesOf) {
  const counts = new Map();
  for (const r of pool) {
    for (const value of valuesOf(r)) {
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

function buildCatalog(params) {
  const filters = parseCatalogQuery(params);
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const sort = params.get('sort') || 'featured';

  const matched = ROBOTS.filter((r) => matchesCatalog(r, filters, null));

  const sorted = [...matched];
  if (sort === 'price-asc') sorted.sort((a, b) => a.pricePkr - b.pricePkr);
  else if (sort === 'price-desc') sorted.sort((a, b) => b.pricePkr - a.pricePkr);
  else if (sort === 'name-asc') sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'name-desc') sorted.sort((a, b) => b.name.localeCompare(a.name));
  else if (sort === 'sellers-desc') sorted.sort((a, b) => b.offerCount - a.offerCount);

  const start = (page - 1) * CATALOG_PAGE_SIZE;

  // The price range is drawn from everything the *other* filters allow, so
  // dragging the slider never shrinks its own track out from under the hand.
  const priceable = ROBOTS.filter((r) => matchesCatalog(r, filters, 'price')).map((r) => r.pricePkr);

  return {
    total: matched.length,
    page,
    pageSize: CATALOG_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(matched.length / CATALOG_PAGE_SIZE)),
    sort,
    filters,
    products: sorted.slice(start, start + CATALOG_PAGE_SIZE),
    facets: {
      category: countBy(ROBOTS.filter((r) => matchesCatalog(r, filters, 'category')), (r) => [r.category]),
      platform: countBy(ROBOTS.filter((r) => matchesCatalog(r, filters, 'platform')), (r) => r.platforms),
      skill: countBy(ROBOTS.filter((r) => matchesCatalog(r, filters, 'skill')), (r) => [r.skill]),
      inStock: ROBOTS.filter((r) => matchesCatalog(r, filters, 'inStock') && r.inStock).length,
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

// ---------------------------------------------------------------- http

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = (req.url || '').replace(/^\/api/, '') || '/';

  try {
    if (req.method === 'GET' && url.startsWith('/health')) {
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        robots: ROBOTS.length,
        tutorials: TUTORIAL_LIBRARY.length,
        // Products listed on more than one store: the ones a price comparison
        // actually compares. A fact about the crawl, like the two above.
        multiSeller: MULTI_SELLER,
      }));
      return;
    }

    if (req.method === 'GET' && url.startsWith('/tutorials')) {
      // The whole library in one response. It is 87 rows, and the page filters
      // and facets client-side, so paginating it would add a round trip and a
      // query-string contract for no gain. Revisit if it reaches the thousands.
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tutorials: TUTORIAL_LIBRARY, count: TUTORIAL_LIBRARY.length }));
      return;
    }

    if (req.method === 'GET' && url.startsWith('/catalog')) {
      const params = new URL(url, 'http://localhost').searchParams;
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildCatalog(params)));
      return;
    }

    res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `No route for ${req.method} ${url}` }));
  } catch (err) {
    console.error('Request failed:', err);
    if (!res.headersSent) {
      res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`Mock chain server listening on http://localhost:${PORT}`);
});
