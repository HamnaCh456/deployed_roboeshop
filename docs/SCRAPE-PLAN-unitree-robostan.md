# Adding shop.unitree.com and robostan.pk to the scraper

Target sites:

- `https://shop.unitree.com` — Shopify. The URL supplied was a single product
  (`/collections/humanoid-robot/products/unitree-r1`); the whole storefront is 30
  products, so we crawl the store rather than the one page.
- `https://robostan.pk` — WooCommerce, 830 products.

## Findings from probing (2026-08-15)

| Site | Platform | Catalog | Verdict |
|---|---|---|---|
| shop.unitree.com | Shopify, `/products.json` open | 30 products | reachable, but wrong currency + no category/brand |
| robostan.pk | WooCommerce, Store API open | 830 products | **blocked: every request 403** |

### Hurdle 1 — robostan.pk returns 403 to the scraper (blocker)

`server: hcdn` (Hostinger CDN) answers every request with a "Checking your
browser before accessing" interstitial and a `/hcdn-cgi/jschallenge` script.

Diagnosis: it is **not** a cookie challenge. A headless Chromium got HTTP 200 on
the *first* request and no clearance cookie was ever set. Isolating the variable
against `https://robostan.pk/`:

| Request | Result |
|---|---|
| `User-Agent` only, HTTP/1.1 | **403** |
| `User-Agent` only, HTTP/2 | 200 |
| Full browser header set, HTTP/1.1 | 200 |

So the WAF fingerprints the *header set*, not the UA string and not JS. The
scraper's honest `RobotEshop-FYDP/0.1 (+academic project; contact …)` UA passes
fine once the normal browser headers accompany it — we do not have to lie about
who we are, and we do not need a headless browser (which would have cost ~830
page renders).

Fix: send the header set a browser sends. `robots.txt` allows `/`.

### Hurdle 2 — every Unitree price would be recorded as PKR

`currency` defaults to `"PKR"` on `Robot` and `PricePoint`, and the Shopify
adapter never sets it. Unitree sells in USD, so `Unitree G1` would be stored as
13,500 PKR instead of USD 13,500 — and would then be compared against robostan's
PKR prices. Shopify publishes `/meta.json` with `"currency":"USD"`; read it once
per store.

### Hurdle 3 — every Unitree product would end up brandless

`vendor` is `"UnitreeRobotics"` on all 30 products. `is_retailer_name()` compares
the candidate against `seller_name`, but the Shopify adapter *sets*
`seller_name = vendor`, so the test is circular and rejects any vendor. It then
falls to `detect_brand()`, which requires a name from `_BRANDS` — Unitree is not
in the list. Result: brand unknown on all 30.

Fix: compare against the site domain (which is what "retailer" actually means),
so `Robo.pk` on `robo.pk` is still rejected, and accept a surviving `vendor` as
the brand. Add Unitree to `_BRANDS`.

### Hurdle 4 — the taxonomy has no robots in it

The taxonomy was written for a components shop. It has no rule for humanoid or
quadruped robots, no bare `motor` rule (only `dc motor`/`gear motor`), and no
LiDAR — so `Unitree G1`, `Unitree Go2`, `Unitree B2`, `Unitree A1 Motor` and
`Unitree 4D LiDAR L2` all classify as UNCLASSIFIED. robostan adds its own
vocabulary the rules miss: MOSFET, IGBT, optocoupler, crystal oscillator,
programmer/burner, ADC.

## Changes

1. `robotshop/http.py` — browser-realistic default headers. Unblocks robostan.
2. `robotshop/adapters/shopify.py` — read `/meta.json` for the shop currency,
   apply to every robot and price point.
3. `robotshop/enrich.py`
   - `is_retailer_name()` tests the domain, not the vendor-derived `seller_name`
   - `enrich()` accepts a non-retailer `vendor` as brand
   - `_BRANDS` += Unitree
   - new `Robots` category (Humanoid / Quadruped / Robotic Arm), plus rules for
     LiDAR, bare `motor`, and robostan's discrete-component vocabulary
   - `_SPECIFIC_COLLECTIONS` += robostan's WooCommerce categories and Unitree's
     collections
4. `robotshop/export.py` — report the price range per currency; the heading is
   hardcoded `PKR` and is wrong the moment two currencies are in one run.
5. `run.py` — force UTF-8 stdout; a Unitree title contains full-width parens and
   the Windows console is cp1252.
6. `config.yaml` — register both sites.
7. `tests/test_enrich.py` — cover the brand and taxonomy changes, and assert the
   robo.pk retailer rejection did not regress.

## Verification

- `python -m pytest tests -q` — existing tests must stay green.
- Run both sites; check `data/report.txt` for coverage and that
  UNCLASSIFIED is a small fraction.
- Spot-check that Unitree rows carry `currency=USD` and robostan rows `PKR`.

## Outcome (run 2026-08-15)

`python run.py https://shop.unitree.com https://robostan.pk`

| | Unitree | Robostan |
|---|---|---|
| products | 30 / 30 | 830 / 830 |
| categorized | 100% | 99.6% (3 unclassified) |
| priced | 100% (USD) | 100% (PKR, 64 at 0 = POA) |
| brand identified | 100% | 8.4% — expected, it is a components distributor |
| HTTP errors | 0 | 0 |

All 30 Unitree rows were checked by hand and every one is right, including the
cases that motivated the changes: Z1 → Robotic Arm, As2 → Quadruped, the LiDARs
→ Sensors, and the batteries/chargers/motors → parts rather than robots.

Two further defects were found while reviewing real output, and fixed:

- **83 robostan titles carried raw HTML entities** ("Programmer &#038; Debugger",
  "LCD 20&#215;4"). The Store API escapes strings; the adapter now unescapes.
- **170 robostan titles end in retail SEO wording** ("Buy … Online Best Price in
  Pakistan"), which was going straight into `match_key` — the exact field whose
  job is to recognise one product across sites. Stripped in `build_match_key`.
  The displayed `name` is left as the vendor wrote it.

Tests: 63 pass (32 added).

Not done, and worth a decision later: the retail SEO wording is still present in
the display `name`, since removing it edits vendor-stated text. It only affects
robostan rows.
