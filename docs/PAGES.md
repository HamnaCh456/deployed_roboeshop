# What to build next

Which pages the app still needs, ordered by value against what the scraped data
can actually support today. Measured on `scraper/data/robots.json`:
**3,269 listings → 2,880 unique products, across 5 sites.**

---

> **Status, August 2026.** Steps 1 and 2 below are built. The catalogue lives
> at `/`, `/catalog` and `/catalog/[category]` with a faceted sidebar over
> `GET /catalog`. Category pages (step 4) came free with it — the navbar
> strip's dead `#` links now route.
>
> **September 2026.** The UI moved from Create React App + `react-router-dom`
> to Next.js 16's App Router; routes are now folders under `ui/src/app/`.
> Nothing below changes in substance — a product-detail page is
> `src/app/catalog/[category]/[slug]/page.tsx` when it comes.
>
> **The recommendation below was not followed.** Option A put the catalogue in
> the left pane; the catalogue was instead built full-width with the assistant
> as a corner launcher, because the layout it is matched to needs 828px of card
> column and the left pane offers about 380px after the filter rail. The
> assistant is one click away rather than always visible — the cost of that
> trade is real and is the thing to revisit if the chat↔filter wiring makes the
> two feel disconnected.

## The architectural decision first

There is no router. `App.tsx` renders one screen: navbar, a static left pane,
and a fixed chat panel. Two ways to add pages:

**A. Left pane becomes the page surface.** The chat stays docked on the right at
all times; the left 40% becomes the navigable area. Browse, detail, and compare
are all views of that pane.

**B. Conventional multi-page app.** Real routes, full-width pages, chat demoted
to a floating widget.

**Recommend A.** The assistant is the differentiator named in the proposal — the
thing no Pakistani competitor has. Option B buries it behind a button and the app
becomes an ordinary catalogue with a chatbot bolted on. Option A keeps the
conversation beside the content, so the assistant can drive the left pane
("show me the cheapest one" → the pane changes), which is a genuinely better
product than either half alone.

It also costs less: the left pane is currently dead space, so nothing is lost.
Add `react-router-dom` and route only that pane.

---

## Readiness

| Page | Value | Data ready? | Notes |
|---|---|---|---|
| 1. Browse / catalogue | **Critical** | ✅ Yes | 2,880 products are currently reachable *only* by chatting |
| 2. Product detail | **High** | ✅ Yes | description 97%, specs_raw 72%, features 56% |
| 3. Compare | **High** | ⚠️ Partly | Only 62 products are sold on more than one site |
| 4. Category pages | Medium | ✅ Yes | Navbar links are dead `#` today; ~free once browse exists |
| 5. Cart / shortlist | Medium | ✅ Yes | Server already tracks a cart — there is no UI for it |
| 6. Price history | Medium | ❌ No | 1 price point per product; needs repeat crawls |
| 7. Tutorials / learn | **High** | ✅ **Built** | 89 real tutorials — 87 indexed from RobotShop Community via the Internet Archive, plus curated pages from The Construct and RoboDK fetched live; 68 carry a parts list priced from the catalogue |
| 8. Seller profiles | Low | ❌ No | `seller_verified` null across all 3,269 |
| 9. Community reviews | **High** | ✅ **Built** | Needs no scraped data — the content is written by readers. Reviews, replies and helpful votes are rows in Supabase, readable by anyone; writing needs an account, and rows are signed and owned by it |

---

## 1. Browse / catalogue — build this first

Chat is a bad way to explore 2,880 products. You cannot skim, and you cannot see
what exists without knowing to ask for it.

```
┌──────────────┬──────────────────────────────┐
│ FILTERS      │  2,880 products              │
│              │  ┌──────┐ ┌──────┐ ┌──────┐  │
│ Category     │  │ card │ │ card │ │ card │  │
│  Sensors 616 │  └──────┘ └──────┘ └──────┘  │
│  Proto   871 │  ┌──────┐ ┌──────┐ ┌──────┐  │
│              │  │ card │ │ card │ │ card │  │
│ Price        │  └──────┘ └──────┘ └──────┘  │
│  ──○────○──  │                              │
│ Platform     │                              │
│  Arduino     │                              │
│ Skill        │                              │
│ ☐ In stock   │                              │
└──────────────┴──────────────────────────────┘
```

Reuse `.robot-card` exactly as it is. Filter facets that have real coverage:
category (96%), price (96%), platform, skill, in-stock (99%).

**Wire the filters to the assistant.** The parser in `server.js` already turns
"beginner Arduino sensors under Rs 500" into a filter object — have it set the
browse filters, and have manual filter changes appear as chat context. That is
the feature neither a plain catalogue nor a plain chatbot can offer.

## 2. Product detail

Everything the card omits. Data coverage is good:

| Section | Source | Coverage |
|---|---|---|
| Gallery | `images` | 2.1 per product |
| Description | `description_text` | 97% |
| Key features | `features` | 56% |
| Full spec table | `specs_raw` | 72%, avg 7.1 rows |
| Compatibility | platforms / languages / OS | ~40% |
| Sellers | `sellers[]` | 100% |
| Buy | `source_url` | 100% |

Render `specs_raw` verbatim as a two-column table — it is deliberately lossless
in `models.py`, so it shows real vendor labels even where normalisation failed.

## 3. Compare

The proposal's objective 3, and nobody local has it. Two or three products, one
spec per row, differences highlighted.

Be honest about the limit: only **62 products** are currently listed on more than
one site, so most comparisons are spec-vs-spec rather than price-vs-price. That
number grows with every site added to `config.yaml`.

## 4–5. Category pages and cart

Both are cheap once browse exists. Category pages are browse with a preset
filter, and the navbar links are dead `#` today. The cart already exists
server-side (`carts` in `server.js`) with no UI.

## 6–8. Blocked on data, not on UI

- **Price history** needs repeat crawls. One scheduled re-run per week starts
  accumulating `price_history` immediately — worth starting now, since the data
  only becomes useful after weeks of collection.
- **Tutorials** are done, by a route the original plan did not consider. The
  product schema's `tutorial_videos` is still empty and still an editorial
  field — but the tutorials *page* no longer waits on it. `run_tutorials.py`
  indexes 87 real tutorials from the Internet Archive's snapshots of
  community.robotshop.com and prices the parts each one names against the
  scraped catalogue.

  It now takes a second kind of source as well: a curated list of individual
  pages from publishers who serve us directly, in
  `scraper/robotshop/tutorials/external.py`. Adding one is a line in that
  tuple. The first two are The Construct's *C++ for Robotics* and RoboDK's
  *Free Robot Training*, and the first of them is the only row in the whole
  project — product or tutorial — that carries ROS, which is the coverage gap
  named in the README. A "Published by" facet appeared on the page the moment
  there was more than one publisher to choose between.

  The join is the point, and it is the thing no competitor has: RobotShop can
  teach the build but cannot tell a student in Lahore what it costs, and Robo.pk
  can price the parts but publishes no lessons. What is still missing is the
  reverse link — a product page saying "3 tutorials use this part" — which is a
  `match_key` lookup away now that `parts[].matchKey` exists.
- **Verified sellers** needs a rule for what "verified" means. Right now nothing
  populates it, so the badge never shows.

---

## Data hygiene worth fixing alongside

| Issue | Detail |
|---|---|
| Currency | `shop.unitree.com` quotes USD, the other four PKR. The UI now shows native currency and converts only for sorting, using a hard-coded `RATE_TO_PKR` in `server.js`. Move this into the scraper. |
| Uncategorised | 140 listings have no category, so they are invisible to category filters. |
| Watermarks | Some supplier photos carry vendor watermarks — avoid those for hero imagery. |
| `stock_qty` | 0% populated, though `in_stock` is 99%. |

---

## Suggested order

1. ~~Router + left pane as the page surface~~ — done, full-width rather than the pane
2. ~~Browse with filters~~ — done
3. **Product detail** — next. Cards currently link out to the seller, which is
   the one obvious gap now that browsing works
4. ~~Category pages~~ (done) and cart
5. Compare
6. Start weekly crawls so price history has something to show later
7. ~~Community reviews~~ — done, at `/community`

## 9. Community reviews

The one page here that was never blocked on the crawl: readers supply the
content. It closes the same gap tutorials do — a catalogue can say what a part
costs and who stocks it, and cannot say that the cheap ultrasonic module needs
a pull-up or that one seller's batch arrives dead.

A review is a **bench report**, not a star rating. Past the score and the prose
it carries three fields the general marketplaces do not: the board it was tested
on, how long it has been in use, and whether the unit arrived working. All three
are optional; the arrival answers aggregate into the dead-on-arrival rate in the
hero, which is the figure the page exists to publish.

Every review is pinned to a catalogue product through the typeahead over
`GET /catalog?q=`, and the product is denormalised into the review — ids do not
survive a re-crawl, so a review holding only an id would lose its subject.

**Storage is the seam.** `ui/src/data/reviewStore.ts` is the only file that
knows reviews are Supabase rows. The move from `localStorage` was a rewrite of
that file plus the two facts that used to be device-local (voted, written
here), which became facts about the account: a `review_votes` table and an
`author_id` column. Schema, triggers and policies:
[superpowers/specs/2026-09-19-community-supabase-design.md](superpowers/specs/2026-09-19-community-supabase-design.md).

Two things worth doing next, both cheap now the rows are shared:

- **Reviews on the product detail page.** Detail is step 3 above; the store
  already keys reviews by product, so the ratings summary is a filter away.
- **A rating column in the catalogue.** `sort=rating-desc` belongs beside the
  price sorts in `buildCatalog()`; the mock server would read the aggregate
  from Supabase at boot, or the catalogue would move there first.

## Half wired: chat ↔ filters

The feature named above as "neither a plain catalogue nor a plain chatbot" has
its server half. The assistant (`ui/src/app/api/query/stream/route.ts`) emits a
`{type: "filters", payload}` SSE frame after the cards, carrying the exact
`GET /catalog` filters it applied — `{"category": "Sensors", "platform":
["Arduino"]}` for "sensors for Arduino". The regex `parseFilters()` in
`server.js` is gone; the filters now come from the model, validated in
`ui/src/agent/tools/searchCatalog.ts`, so they are already in the catalogue's
own vocabulary. What remains is the catalogue listening: turn that payload into
a query string and push it, and announce manual rail changes back into the
chat — no restructuring, just the wire.
