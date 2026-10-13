# RobotEshop scraper

A deep-crawl pipeline that turns robotics store URLs into a normalized,
comparable robot catalog.

You paste a URL. It works out what kind of store that is, walks the whole
catalog, extracts every field it can find, derives the fields the vendor never
bothered to state, and writes the result to SQLite plus JSON/CSV.

**There is no API key and no per-page cost.** Extraction is CSS selectors and
regex from end to end. See [Why no LLM](#why-no-llm) below.

---

## Quick start

```bash
cd scraper
pip install -r requirements.txt

python run.py https://robo.pk                 # crawl one site
python run.py https://robo.pk --images        # also download product photos
python run.py --from-config                   # crawl every site in config.yaml
python run.py https://robo.pk --limit 10      # first 10 products, for testing
```

Outputs land in `scraper/data/`:

| File | What it is |
|---|---|
| `robots.db` | SQLite database, the real store — includes price history |
| `robots.json` | every field, full fidelity — the backend/API seed |
| `robots.csv` | one flat row per robot, 48 columns — open in Excel |
| `products.csv` | drop-in replacement for `mock-server/products.csv` |
| `report.txt` | coverage report: what was captured, and what is missing |
| `tutorials.json` | 89 tutorials — 87 from the RobotShop Community plus the curated publishers in `tutorials/external.py` — parts priced from the catalogue, written by `run_tutorials.py`, served at `GET /tutorials` |
| `tutorials-report.txt` | the same coverage treatment for tutorials |

### Useful flags

| Flag | Effect |
|---|---|
| `--limit N` | stop after N products per site |
| `--no-deep` | skip the per-product page pass (faster, less data) |
| `--images` | download photos into `ui/public/images/` |
| `--fresh` | ignore the HTTP cache and refetch everything |
| `--delay 2.0` | seconds between requests (default 1.0) |
| `--adapter generic` | force an adapter instead of auto-detecting |
| `--max-depth`, `--max-pages` | crawl bounds for the generic adapter |

---

## How it decides how to crawl a site

Detection runs cheapest-and-most-complete first:

```
your URL
   │
   ├─ Shopify?      /products.json          → full catalog as JSON   ← robo.pk, shop.unitree.com
   ├─ WooCommerce?  /wp-json/wc/store/v1    → full catalog as JSON   ← robostan.pk, indusrobotix.com
   ├─ Magento?      /graphql                → full catalog as JSON   ← instock.pk
   ├─ no shop?      sitemap → page per robot                        ← nexarobots.com
   └─ neither       crawl4ai deep crawl     → rendered HTML, BFS
```

**This matters more than it looks.** robo.pk is a Shopify store, so its entire
144-product catalog is published as structured JSON. Reading that is strictly
better than scraping rendered pages: complete, already typed, far faster, and
much gentler on the vendor's server. The pipeline *then* deep-crawls each
product page anyway, because breadcrumbs, app-injected spec tables, embedded
videos, stock wording and JSON-LD availability exist **only** in the HTML.

For sites with no JSON API, `adapters/generic.py` runs **crawl4ai** with
`BFSDeepCrawlStrategy` over a real headless Chromium, so JavaScript-rendered
catalogs still give up their data.

Adding another site later means appending a module to `adapters/` — nothing
else in the pipeline changes.

### Magento: instock.pk

Its REST API answers `401` and its sitemap times out, but `/graphql` is open and
unauthenticated — which is normal, because Magento's own storefront JavaScript
uses it. That endpoint hands over all **2,244 products in 45 requests**, with
prices, stock, images, categories and descriptions already structured.

Two quirks the adapter handles. Descriptions are Magento Page Builder output
wrapped in layout `<div>`s and an inline `<style>` block, and several were pasted
out of a Google or ChatGPT window and still carry `data-sfc-*` attributes and
`<!--TgQPHd|||[]-->` comments — all stripped before parsing. And the catalog is
**not purely robotics**: it also stocks 3D-printer filament, Lenovo laptop
motherboards and even dental face shields. Use `--search robot` (or the `search:`
key in `config.yaml`) to scope a crawl to the robotics slice.

### Brochure sites: nexarobots.com

This one is not a shop at all. It looked like WooCommerce because it is
WordPress, but it has **zero `add-to-cart` markup** — it is a Pudu/Pepper
distributor's marketing site. Each robot is a plain WordPress page
(`/bellabot/`, `/swiftbot/`) with no price and no SKU.

`adapters/catalog_site.py` reads the Yoast sitemap, treats the listed pages as
candidate robots, and **keeps rows that have no price**, marking them
`availability_text = "Enquiry / POA"` so the UI can show "Price on request"
rather than a misleading blank. That is how this market actually sells, and these
commercial service robots are exactly the industrial half of the proposal's
scope.

Getting it right needed two fixes worth remembering:

- These pages have **no `<h1>`**, and on three of them `<main>` is an empty
  shell. Selecting `main or article or body` returned nothing. The adapter now
  measures every candidate container and takes the richest, which is theme
  agnostic.
- Stripping `header, footer, nav` — which sounds obviously right — **deleted
  three entire pages**, leaving 413 characters of chrome. Elementor's theme
  builder wraps the whole page template in a `<header>`. Chrome is now removed
  only when doing so leaves at least half the text behind.

The second one is a good lesson in not trusting a coverage number: it was a
browser render showing the *same* 413 characters that proved the content was
never missing and the parser was eating it.

---

## When a site refuses to be read

**robostan.pk answered every request with HTTP 403** and a "Checking your
browser before accessing" page. That page is worth reading carefully before
reaching for a headless browser, because the obvious diagnosis is wrong.

It is served by Hostinger's CDN WAF (`server: hcdn`) and loads
`/hcdn-cgi/jschallenge`, which looks exactly like a JavaScript challenge. It
is not one. A headless Chromium was let through on its *first* request and no
clearance cookie was ever set — so there was nothing for a browser to solve.
Isolating one variable at a time against `https://robostan.pk/`:

| Request | Result |
|---|---|
| `User-Agent` only, HTTP/1.1 | **403** |
| `User-Agent` only, HTTP/2 | 200 |
| Full browser header set, HTTP/1.1 | 200 |

The WAF fingerprints the **header set**, not the UA string and not JavaScript.
So `http.py` sends the headers a browser sends (`Accept`, `Sec-Fetch-*`,
`sec-ch-ua`, `Upgrade-Insecure-Requests`) and the whole 830-product Store API
opens up — at the cost of 9 JSON requests rather than 830 rendered pages.

Note the User-Agent still identifies this scraper honestly, with a contact
address. That was never the problem: a plain Chrome UA on its own is refused
too. `robots.txt` allows `/`.

A 403 is now reported per URL with the responding server, and counted in
`fetcher.stats["blocked"]`, instead of being retried three times and folded
into a generic failure count — a blocked site should be obvious, not silent.

### Sites that cannot be crawled: robotshop.com

robostan.pk turned out to be a header-fingerprint check that a well-formed,
honestly-identified request satisfies. **robotshop.com is a different thing**,
and the pipeline deliberately does not crawl it.

| Attempt | Result |
|---|---|
| Plain HTTPS request | **403** |
| crawl4ai headless Chromium | **403 / 307**, Cloudflare interstitial |
| `crawl4ai` search page | **403**, "Performing security verification" |
| `/robots.txt` itself | **403** |

The last row is the one that settles it. When a site will not even serve its
`robots.txt` to a non-browser client, it has no published crawl policy to comply
with, and the only remaining way in is to defeat Cloudflare's bot detection with
an anti-detection browser. crawl4ai ships `UndetectedAdapter` for exactly that,
and this project does **not** wire it in. Circumventing bot management on a large
commercial retailer is a terms-of-service problem and a plausible route to having
your university IP range blocked — a bad trade for one product page in an
academic aggregator.

**The supported route instead — `--from-html`.** Open the page in your own
browser, save it (`Ctrl+S`), and hand the file to the pipeline:

```bash
python run.py --from-html saved/thymio.html
python run.py --from-html saved/            # every .html in the folder
```

You visiting a public page in your own browser is not scraping. The saved file
goes through the same parsing and enrichment as everything else, and the real
source URL is recovered from the page's own `<link rel=canonical>` so the row
lands under `robotshop.com` and joins price comparison normally.

### The same wall, and the other way round it: community.robotshop.com

`community.robotshop.com` hosts RobotShop's tutorials — the content that closes
the proposal's stated market gap. It is behind the **same** Cloudflare rule:
`/robots.txt` answers 403, and so does every tutorial page and every thumbnail.
Everything above applies, and `UndetectedAdapter` stays unwired here too.

Saving 87 pages by hand is not a serious pipeline, so this one takes a different
supported route: **we do not request anything from their servers at all.** The
Internet Archive holds public snapshots of these pages, serves them over an open
API with no challenge, and exists to be read by machines.

```bash
python run_tutorials.py            # CDX index -> archived pages -> data/tutorials.json
```

What that means in practice, and the line it does not cross:

- We take metadata and a link — title, byline, dates, thumbnail — never the
  article body as published content. The body is read only to work out which
  *parts* the tutorial names, and is then discarded.
- Every row records the snapshot it was read from in `archivedUrl`, so any
  claim on our page can be traced to a fixed, citable copy.
- Every tutorial on the site links back to the original, credits its author,
  and is labelled with `sourceName`. The UI never presents one as ours.

The value we add is the half they cannot write: their lesson says "connect a
potentiometer to A0", and our catalogue knows a potentiometer is Rs 30 at
instock.pk today. See `robotshop/tutorials/bom.py`.

### Publishers who simply let us in

Not every source needs routing around. `robotshop/tutorials/external.py` holds
a short list of individual pages from publishers whose `robots.txt` allows the
path we read and whose servers answer a normal request:

| Publisher | Page | `robots.txt` (checked 2026-08-22) |
|---|---|---|
| The Construct | [C++ for Robotics](https://www.theconstruct.ai/robotigniteacademy_learnros/ros-courses-library/cpp-for-robotics/) | `Disallow: /wp-admin/` only |
| RoboDK | [Free Robot Training with RoboDK](https://robodk.com/blog/free-robot-training-with-robodk/) | `/files/`, `/downloads/private/`, `/license/`, `/forum/…` |

These are fetched live, one request each at the standing 1 req/s, so
`archivedUrl` is null for them — there is no snapshot to cite, and claiming one
would be a citation to nowhere. Everything else is the same deal as above:
metadata and a link, the body read only for part matching, `sourceName` on the
card, and a link back to whoever wrote it.

It is a **seed list, not a crawl**, and that is the difference between the two
sources. `wayback.py` indexes one site exhaustively because it is one library
with one layout. Each line of `SOURCES` is instead a judgement that this
particular page is worth a card. Adding a publisher is appending to that tuple;
nothing else changes, because `external.parse` returns the same record shape
`parse.parse` does and the enrichment runs on both alike.

Two things the second source taught the shared rules, both now in
`tests/test_tutorials.py`:

- **A page's headline decides its category, not its word count.** A 900-word
  article on offline robot programming that names a camera once was filed under
  Sensors, because `_CATEGORY_RULES` lists Sensors above Controllers and
  first-match read the whole page. Counting mentions instead re-filed 40 of the
  87 archived tutorials and put "Basic structure of industrial robotic arm"
  under Sensors, so that was not the fix; asking the publisher was.
- **ROS 2's distribution codenames are ordinary English words.** Seeding the
  framework keywords with `humble`, `iron`, `jazzy`, `foxy` and `galactic`
  tagged a tutorial about *inductors* as ROS 2, off the phrase "iron core".
  Same class as `ros` inside *gyroscope*, except a word boundary cannot save
  you — the word really is there. Only a qualified codename counts.

---

## Why no LLM

crawl4ai ships an `LLMExtractionStrategy` that calls OpenAI and bills per page.
We deliberately never use it, and use `JsonCssExtractionStrategy` and local regex
instead. That is not only about cost — it is also more accurate here.

robo.pk descriptions are not prose. They are strict label/value lists:

```html
<p><strong>Operating Voltage:</strong> 3V–5V DC.</p>
<p><strong>Interface:</strong> I2C serial communication.</p>
<p><strong>Sensors:</strong> 3-axis accelerometer and 3-axis gyroscope.</p>
```

A regex reads that with 100% precision, for free, forever. An LLM would cost
money per product and could paraphrase or hallucinate a voltage. Rules win.

Four HTML shapes are handled (`parse_specs.py`): `<strong>` label/value, two-column
tables, `<li>Label: value</li>`, and bare `Label: value` text lines.

> Incidentally, several robo.pk descriptions were pasted straight out of a
> ChatGPT window and still carry its entire DOM wrapper. The parser detects and
> strips that, or every spec sheet would be polluted with chat UI scaffolding.

---

## What gets captured

Everything the page states, plus a lot it doesn't. Full field list in
`robotshop/models.py`.

**Scraped directly** — name, price, compare-at price, discount, currency, stock,
SKU, variants, images, description, and every `label: value` pair verbatim in
`specs_raw` (nothing is ever discarded, even if the normalizer doesn't recognise it).

**Derived, because the source has no such field** — this is the important part.
robo.pk leaves `product_type` blank on all 144 products, ships zero tags, and
lists "Robo.pk" as the vendor of every single item. So the pipeline infers:

| Field | How |
|---|---|
| `category` / `subcategory` | 28-rule taxonomy over collections → title → description |
| `brand` | real manufacturer from the title, or the vendor field on a manufacturer's own store; the retailer is explicitly rejected, and store spellings are normalized ("UnitreeRobotics" → Unitree) |
| `model_number` | stated driver/sensor IC first, then part-number regex on the title |
| `supported_platforms` | Arduino / Raspberry Pi / ESP32 / STM32 / micro:bit / Jetson |
| `supported_os` | Windows / Linux / macOS / Android / iOS |
| `programming_languages`, `ides_tools` | C/C++, Python, Scratch, Blockly, Arduino IDE, Thonny… |
| `ros_support`, `ros_version` | ROS 1 / ROS 2 |
| `interface`, `connectivity` | I2C, SPI, UART, PWM / WiFi, BLE, LoRa, GPS… |
| `skill_level`, `age_min`, `age_max` | proposal objective: age- and skill-based recommendations |
| `use_case` | educational / hobbyist / research / industrial |
| `match_key` | groups the same part across sites — this is what powers price comparison. Retail SEO wording is stripped first: 170 robostan.pk titles end in "Best Price in Pakistan", and left in, a board would never match itself listed plainly elsewhere |

### Two things a second and third store forced

**Currency is per store, not global.** `Robot.currency` defaults to PKR, which
was invisible while every site was Pakistani. shop.unitree.com prices in USD, so
the Shopify adapter now reads `/meta.json` for the store's own currency — a
USD 13,500 humanoid was otherwise recorded as 13,500 rupees and compared against
real rupee prices. `report.txt` ranges prices per currency for the same reason.

**A robot manufacturer's copy never says what shape its robot is.** Unitree's G1
page does not contain the word "humanoid"; the Go2 page does not say "quadruped"
or even "robot". Marketing copy describes what a machine achieves. What it does
say is the model name, and for this vendor that is unambiguous — H/G/R humanoids,
Go/A/B quadrupeds, Z arms — so `enrich.py` carries a small, site-scoped model
table (`_MODEL_LINES`) that runs before the keyword rules. It stands down when
the title names a part, so "Go2 Battery" is still a battery.

Two traps this avoids, both real: the Z1 *arm* calls itself "designed for Unitree
robot dogs" and was filed as a quadruped, and the As2 quadruped advertises
"powerful motors" and was filed under Motors & Actuators. Generic words like
`motor` and `battery` now count as evidence only in the title, the same rule the
codebase already applied to platform words like `arduino`.

**Left deliberately empty for a later editorial pass** — `tutorial_videos`,
`documentation_links`, `community_links`, `getting_started_guide`, `editor_notes`.

These are the proposal's actual differentiator ("Robotics e-commerce websites are
not providing video tutorials"). They cannot be scraped, because the source sites
do not have them. The schema carries them, `enrichment_status` tracks which rows
still need work, and the `v_enrichment_queue` view lists them. **A re-crawl never
overwrites these columns** — scraping must not destroy human work.

---

## Re-running, and price history

Safe to run repeatedly. A product is identified by `source_url`; on a second run
the row is updated in place. A new `price_history` row is appended **only when the
price or stock actually moved**, so the table records real movements rather than
how often you ran the scraper. That is what makes the proposal's "historical price
tracking" feature possible — run it weekly on a cron and the data accumulates.

HTTP responses are cached in `scraper/.cache/`, so re-running to fix a parser bug
costs zero requests. Use `--fresh` to force a refetch.

---

## Database

`robotshop/sql/schema_sqlite.sql` is used at runtime.
`robotshop/sql/schema_postgres.sql` is the same schema for the proposal's
PostgreSQL stack — real `JSONB`, `TEXT[]` arrays, GIN indexes, and a full-text
search index over name + description + brand + category.

Tables: `robots`, `price_history`, `images`, `variants`, `crawl_runs`.
Views: `v_price_comparison` (same part, multiple sites, best price),
`v_enrichment_queue` (what still needs tutorials written).

---

## Two things that made price comparison wrong

Both were invisible in the coverage report — it happily said "99.1% have a
price" while the comparison view was misleading.

**A chip family is not a product.** `match_key` anchored on any detected model
number, so all 16 STM32 boards in the catalog became one "product" quoted from
550 to 49,800 PKR — which reads as a 99% saving on the same item. Worse,
`DIP-8`, `SOP-8`, `RJ45` and `RS232` were being treated as model numbers at all;
they are an IC package, a package, a connector and a protocol. Package types,
connectors and protocols are now blacklisted, and bare family names
(`stm32`, `esp32`, `bcm2835`, `hd44780`) no longer anchor a match — those rows
fall back to the name key, which merges less rather than merging wrongly.
A specific variant like `ESP32-C3` or `ACS712` still anchors normally.

**A price of 0 is not free.** 115 rows arrived priced at zero — it is how these
platforms represent "call for price" or an unconfigured variable product. Since
`MIN(price)` drives the comparison, every one of them advertised itself as the
unbeatable best price in its group. Zero is now recorded as unknown, with
`availability_text = "Price on request"` and a `zero_price_treated_as_unknown`
warning.

After both fixes the view shows real comparisons across three sites — ACS712 at
250 vs 420, TP4056 at 50 vs 190, L293D at 190 vs 480 — over 152 comparable
groups.

It is still a heuristic. Where a module *is* its chip ("TP4056 charger") the key
is exactly right; where a chip is one component of a larger board it can still
group loosely. `v_price_comparison` is a starting point for the comparison UI,
not a finished answer.

---

## Tests

```bash
python -m pytest tests -q
```

94 tests, all offline. Every case is a defect that actually shipped and was
caught by inspecting real output — they are not hypothetical.

**Catalogue** (`test_enrich.py`, `test_adapters.py`):

- `"ros"` matched inside **gy·ros·cope**, rating an MPU6050 gyroscope as
  "advanced, 18+"
- `"ble"` matched inside "addressa·ble", tagging a WS2812 RGB LED as Bluetooth
- `"led"` matched inside "control·led"
- Every product was branded "Robo.pk", the shop, not the manufacturer
- The 0.96" display's model number came out as `HD65K` (a colour-depth spec)
  instead of `ST7735S` (its actual driver IC)
- `HC-SR04` was truncated to `SR04` — a different part entirely

The fix for the first three is a *leading* word boundary only; a trailing one
would break legitimate stemming ("voice record" → "voice recording").

**Tutorials** (`test_tutorials.py`) — same rule, newer pipeline:

- A series table of contents sat *inside* the article as links to the other
  lessons, so a potentiometer lesson appeared to need a servo, an IMU and an
  IR distance sensor — lessons 5, 7 and 4 of the same series
- `"resistor"` matched **photo·resistor**: the gyroscope bug again, arriving
  from the product-name side, where tokens were still compared with `in`
- An inductors lesson said "water wheel" six times as an analogy and was sold
  a Rs 600 robot wheel. Frequency cannot catch a metaphor — the phrase is
  disowned by context instead
- A part named once in passing was treated as a part you build with
- `"ultrasonic"` alone resolved to an *Ultrasonic Mist Maker* (a humidifier);
  `"encoder"` alone to a *DTMF Encoder IC* (a telephone tone chip)
- A percent-encoded zero-width space in one slug published the same tutorial
  twice, making 88 rows out of 87 tutorials

These are checked by re-introducing each bug and confirming the test fails —
a test that passes against the broken code is not a regression test.

---

## Politeness and legality

- 1 request/second by default, exponential backoff, 3 retries
- Identifies itself honestly in the User-Agent, with a contact address
- Reads only public catalog pages — no login, no cart, no checkout
- robo.pk's `robots.txt` explicitly permits crawling product and collection pages
- Where a site refuses to publish a crawl policy at all, we do not guess at one
  and we do not defeat its bot management. `robotshop.com` gets `--from-html`;
  `community.robotshop.com` gets read from the Internet Archive instead, and
  its servers are never touched. `UndetectedAdapter` is not wired in anywhere.
- Tutorials are indexed, not republished: metadata and a link, the author
  credited on every card, the snapshot cited in `archivedUrl`

Raise `--delay` if a site starts returning 503s.

---

## Layout

```
scraper/
  run.py                    CLI entry point
  config.yaml               sites to crawl
  robotshop/
    models.py               the canonical Robot schema
    http.py                 polite fetcher: retries, throttle, disk cache
    parse_specs.py          rule-based spec extraction (no LLM)
    enrich.py               derived fields: category, platform, skill, brand
    store.py                SQLite upsert + price history
    export.py               JSON / CSV / UI catalog / coverage report
    adapters/
      shopify.py            products.json + per-product deep crawl
      woocommerce.py        Store API
      generic.py            crawl4ai BFS deep crawl for everything else
    tutorials/              second pipeline: lessons, not products
      models.py             the canonical Tutorial schema
      wayback.py            Internet Archive CDX index + snapshot URLs
      parse.py              archived HTML -> a raw record (JSON-LD first)
      external.py           curated publisher pages -> the same record shape
      enrich.py             category, level, platform, format
      bom.py                parts named in the text -> priced catalogue rows
      export.py             tutorials.json + coverage report
    sql/
      schema_sqlite.sql
      schema_postgres.sql
  run_tutorials.py          CLI entry point for the tutorial pipeline
  tests/test_enrich.py
  tests/test_adapters.py
  tests/test_tutorials.py
  data/                     outputs (gitignored)
  .cache/                   HTTP cache (gitignored)
  .cache_tutorials/         Archive cache (gitignored)
```
