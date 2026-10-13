# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

RobotEshop (product name **Servo**) is a final-year degree project: *"A Unified
Web Aggregation Platform for Educational and Industrial Robots"*. The scope is
fixed by [FYDP-DSE_005_Proposal_Template.pdf](FYDP-DSE_005_Proposal_Template.pdf)
— that document is the spec, and every feature here traces back to one of its
objectives:

1. Centralised marketplace aggregating robot data from many sources
2. Complete hardware **and software** detail — platforms, programming tools, OS support
3. Search, filter, and side-by-side compare
4. Trusted / verified sellers
5. Age-based and skill-based recommendations for educational robots
6. Price comparison, and historical price tracking
7. **Video tutorials** — the gap named in the competitor analysis; no Pakistani
   robotics store (Robo.pk, RoboticPK, IndusRoboTix) has them, and neither does
   a general marketplace like Daraz
8. A robotics-specific AI assistant that explains jargon in plain language

The proposal's target stack is React + FastAPI/Django + PostgreSQL + Docker,
Agile/Scrum, months 3–6 for development. What exists today is a working
prototype of that shape with a rule-based backend — see *Migration path* below.

**[DESIGN.md](DESIGN.md) is the canonical design system.** Read it before
changing any colour, type, or spacing value. It is descriptive of what the app
actually renders, not aspirational.

## Commands

```bash
# UI — port 3000. Next.js 16 (App Router); needs Node 22+ and ui/.env
# (copy ui/.env.example): the mock server's URL plus the assistant's keys.
cd ui && npm ci              # first time only
npm start                    # mock server (unless 8009 already answers) + next dev, via scripts/dev.mjs
npm run build                # next build — also the strictest check we have
npm run serve                # next start, after a build
npm run lint                 # eslint src (eslint-config-next)
npm run lint:fix
npm run format               # prettier
npx tsc --noEmit             # the type check used to verify UI changes
npm test                     # vitest: the assistant's pure functions (validate, trim, cache, failover)

# Mock backend — port 8009. `npm start` in ui/ runs it for you; on its own:
cd mock-server && node server.js

# Scraper
cd scraper && pip install -r requirements.txt
python run.py https://robo.pk              # one site
python run.py --from-config                # every enabled site in config.yaml
python run.py https://robo.pk --limit 10   # fast smoke test
python run.py --images                     # download photos into ui/public/images/
python run.py --from-html saved/page.html  # parse a page saved from your own browser

# Tutorials — separate pipeline, separate entry point. Reads archived
# RobotShop Community pages from the Internet Archive and prices the parts
# they name against data/robots.json, so run the crawl above first.
cd scraper && python run_tutorials.py      # full build -> data/tutorials.json
python run_tutorials.py --limit 5          # fast smoke test
python run_tutorials.py --no-cache         # refetch instead of using .cache_tutorials/

# Scraper tests — 110 offline regression tests, no network
cd scraper && python -m pytest tests -q
python -m pytest tests/test_enrich.py -q                  # one file
python -m pytest tests/test_tutorials.py -q               # the tutorial pipeline
python -m pytest tests/test_enrich.py::test_name -q       # one test
```

UI tests exist only for the assistant's pure functions (`ui/src/agent/**/*.test.ts`,
run with `npm test`); the screens have none. The bar for a UI change is
`npx tsc --noEmit`, a clean `npm run build`, `npm run lint` with no errors, a
clean browser console, and — for anything touching the assistant — the manual
script in its spec. Lint reports ~40 warnings in the upstream NVIDIA chat code
(`any` payloads, setState in fetch effects); those rules are set to `warn` in
`eslint.config.mjs` on purpose — do not add to them, and do not silence them.

## Architecture

Three independent parts joined by one file on disk:

```
scraper/  (Python)  ──> scraper/data/robots.json ──> mock-server/  (Node) ──GET /catalog──> ui/  (Next.js)
  crawl + enrich          3,269 listings,              loadRobots() groups by       │   2,880 products
  no LLM, rules only      2,880 unique products        match_key, serves JSON       │   behind facets
                                                              ▲                     │
run_tutorials.py    ──> scraper/data/tutorials.json ──────────┘                     │   /tutorials
  Internet Archive        87 tutorials, 68 with        loadTutorials(), served      │
  -> parse -> price       a priced parts list          whole at GET /tutorials      │
                                                                                    │
                        ui/src/app/api/query/stream/route.ts  <──POST── Chatbox ────┘
                          one streamText call, Gemini/OpenAI, two tools:
                          search_catalog (GET /catalog as a tool) and
                          find_video_tutorials (SerpAPI YouTube, cached)
```

The tutorial pipeline **reads `robots.json`**, so a product crawl has to exist
before it can price anything. That is its only dependency on the other pipeline;
the two share the keyword matcher in `enrich.py` and nothing else.

`scraper/data/` is **gitignored** (~54 MB, rebuilt by a crawl). The mock server
reads `scraper/data/robots.json` at boot via `CATALOGUE_PATH` in
[mock-server/server.js](mock-server/server.js) — if that file is missing, the
server will not start. `mock-server/robots.json` and `products.csv` are a
hand-authored demo fallback that nothing reads any more.

### The data contract

[scraper/robotshop/models.py](scraper/robotshop/models.py) is the canonical
schema, and its docstring maps each field group onto a proposal objective. One
`Robot` row = one product on one site. The same product on three sites is three
rows sharing a **`match_key`** — that key is the whole basis of price
comparison, and `loadRobots()` in the mock server collapses rows by it into one
card with a seller count.

Two field groups need care:

- **Deliberately empty**: `tutorial_videos`, `documentation_links`,
  `community_links`, `getting_started_guide`, `editor_notes`, `seller_verified`.
  The source sites do not carry them. The schema holds them, the UI hides the
  badge or line when they are absent rather than inventing a value, and **a
  re-crawl must never overwrite them** — scraping must not destroy editorial work.
- **Derived, not scraped**: category, brand, model number, platforms, OS,
  languages, ROS support, skill level, age range, use case, `match_key`. Vendors
  do not state these. All of it is rule-based inference in
  [scraper/robotshop/enrich.py](scraper/robotshop/enrich.py).

### Scraper

`run.py` → adapter (auto-detected) → deep crawl → `parse_specs` → `enrich` →
`store` (SQLite upsert + price history) → `export` (JSON/CSV/UI catalog/report).
Adapters in [scraper/robotshop/adapters/](scraper/robotshop/adapters/) are picked
cheapest-first: Shopify `/products.json` → WooCommerce Store API → Magento
`/graphql` → sitemap (brochure sites) → crawl4ai BFS over headless Chromium.
Adding a site means appending a module there and a block to `config.yaml`;
nothing else changes.

Three standing rules, each explained at length in [scraper/README.md](scraper/README.md):

- **No LLM in extraction.** crawl4ai's `LLMExtractionStrategy` is deliberately
  unused. Vendor descriptions are strict `label: value` lists, so regex reads
  them with full precision, for free, and cannot hallucinate a voltage.
- **Politeness is a constraint, not a setting.** 1 req/s, honest User-Agent with
  a contact address, public catalogue pages only. `robotshop.com` sits behind
  Cloudflare and refuses even `/robots.txt`; crawl4ai's `UndetectedAdapter` is
  intentionally **not** wired in. Use `--from-html` on a page saved from a real
  browser instead.
- **Every test is a shipped defect.** `"ros"` matching inside *gyroscope*,
  `"ble"` inside *addressable*, `HC-SR04` truncated to `SR04`. Fix bugs by adding
  the case to `tests/`, not by patching around it.

### Tutorial pipeline

[scraper/run_tutorials.py](scraper/run_tutorials.py) → CDX index → archived page
→ `parse` → `enrich` → `bom` → `export`. Package:
[scraper/robotshop/tutorials/](scraper/robotshop/tutorials/). This closes
proposal objective 7 with real content instead of placeholders.

- **The source is the Internet Archive, not RobotShop.**
  `community.robotshop.com` sits behind the same Cloudflare bot management as
  the main site and answers this scraper, a headless browser *and*
  `/robots.txt` itself with HTTP 403. So the pipeline never touches their
  servers. It reads public Archive snapshots, keeps metadata and a link, cites
  the snapshot in `archivedUrl`, and links every tutorial back to the original.
  Do not point this at the live site, and do not wire in `UndetectedAdapter`.
- **Thumbnails must be resolved, not constructed.** Their image host 403s too,
  so `image` holds an Archive `im_` URL. Only ~223 of the thumbnails were ever
  captured, which resolves for 81 of 87 tutorials; the rest carry `""` and the
  card renders a "No photo" tile. Never emit a URL you have not found in the
  CDX index — it renders as a broken image.
- **Facts vs inference.** Title, summary, author and dates come from the page's
  JSON-LD `Article` block, unedited. Category, level, platforms, format and the
  parts list are ours, derived by rules.
- **The parts list is the product's argument, and the easiest thing to get
  wrong.** Four classes of bug are already fixed and commented in
  [bom.py](scraper/robotshop/tutorials/bom.py) and
  [parse.py](scraper/robotshop/tutorials/parse.py): a series table of contents
  read as body text (a potentiometer lesson needing a servo and an IMU), a
  token matched as a substring so `"resistor"` hit *photoresistor*, a metaphor
  counted as a component (a water wheel in an inductors lesson), and generic
  terms matched on a single passing mention. Same rule as the crawler: **every
  test is a shipped defect** — add the case, do not patch around it.

### Mock server

[mock-server/server.js](mock-server/server.js) — ~380 lines, Node built-ins only,
no dependencies. It serves the scraper's output over HTTP until the PostgreSQL
backend from the proposal exists:

| Route | Purpose |
|---|---|
| `GET /catalog` | Paginated browse plus facet counts; multi-select params repeat. Also the assistant's `search_catalog` tool |
| `GET /tutorials` | `{count, tutorials}` — the whole library, unpaginated. Empty until `run_tutorials.py` has run; a missing `tutorials.json` is a warning, not a fatal error like a missing `robots.json` |
| `GET /health` | `{status, robots, tutorials, multiSeller}` (`multiSeller` = products on more than one store) |

The regex assistant that used to live here (`buildReply()`, `POST /query*`) is
gone; the assistant is now the Next.js route handler described under *UI*.

`RATE_TO_PKR` is a hard-coded USD→PKR rate used **only** to put PKR and USD
listings on one axis for filtering and sorting; prices always display in the
currency the seller quoted. Move conversion into the scraper before anyone
treats a converted total as accurate.

### UI

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind, with MUI used
for its icons only. The code is NVIDIA's
[Retail Shopping Assistant](https://github.com/NVIDIA-AI-Blueprints/retail-shopping-assistant)
blueprint UI under Apache 2.0 — keep the SPDX headers on the files that carry
them. It was moved off Create React App in September 2026; the design record is
[docs/superpowers/specs/2026-09-19-nextjs-migration-design.md](docs/superpowers/specs/2026-09-19-nextjs-migration-design.md).

| Route | File | Screen |
|---|---|---|
| `/` | `src/app/page.tsx` | Catalogue, unfiltered — the front door |
| `/catalog` | `src/app/catalog/page.tsx` | The same page, so the URL says what it is |
| `/catalog/[category]` | `src/app/catalog/[category]/page.tsx` | Catalogue with a category preset; the navbar strip links here |
| `/tutorials` | `src/app/tutorials/page.tsx` | Tutorials |
| `/community` | `src/app/community/page.tsx` | Community reviews — tag a catalogue product, score it, say what board you tested it on |
| `/assistant` | `src/app/assistant/page.tsx` | The original chat-led screen: full-height panel beside the splash image |
| `/auth/login`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/update-password`, `/auth/error` | `src/app/auth/*/page.tsx` | Accounts — email + password on Supabase Auth, one centred card each. `/auth/confirm` is a route handler that turns an email link into a session |
| any unmatched URL, any page that throws | `src/app/not-found.tsx`, `src/app/error.tsx` | The status pages: both render `components/status/StatusPage` inside the layout, so the navbar stays. The 404 names the path that failed; the error page offers `reset()` and shows the digest. No `global-error.tsx` on purpose. Record: [docs/superpowers/specs/2026-09-19-status-pages-design.md](docs/superpowers/specs/2026-09-19-status-pages-design.md) |

`src/app/layout.tsx` is the only server component: the document shell, fonts,
`Navbar`, and `src/app/providers.tsx` (`AuthProvider`, the toast outlet, and
the `RenderImageContext` that lets either chat surface set the image
`/assistant` displays). Every page file and everything under `components/` is
`"use client"`; the app is client-rendered exactly as it was, just served by
Next.

#### The assistant

`src/app/api/query/stream/route.ts` is `POST /api/query/stream`. It speaks the
mock server's old SSE contract byte for byte (`content` / `products` frames,
then `[DONE]`) plus one new frame, `filters`, that the Chatbox ignores today —
it is the server half of the chat ↔ filter wiring in `docs/PAGES.md`. Design
record: [docs/superpowers/specs/2026-09-19-llm-assistant-design.md](docs/superpowers/specs/2026-09-19-llm-assistant-design.md).

- **The model never sees the catalogue.** `src/agent/tools/searchCatalog.ts`
  wraps `GET /catalog`: the model proposes filters, `validate()` normalises
  them in code (a `maxPrice` of 0 is dropped, "arduino" becomes "Arduino"),
  and `trim()` returns at most six nine-field cards plus facet counts. The
  cards the UI shows are exactly the tool's last result — the model does not
  choose them, so it cannot describe a product that is not on screen. A
  turn with one search costs ~2,100–2,800 input tokens; one without, under
  1,400. The route logs `in=`/`out=` per turn.
- **One env var switches providers.** `LLM_PROVIDER=gemini,openai` is tried
  in order; a failure before the first token moves on; when all fail the reply
  is a fixed line and the catalogue keeps working. Keys and model ids are in
  `ui/.env.example`; `GEMINI_API_KEY` (the Gemini CLI's name) is accepted.
  Gemini's free tier allows five `gemini-2.5-flash` requests a minute.
- **History is text only and lives in `src/agent/memory.ts`**, an in-memory
  `Map` capped at twelve messages. That is the only file that knows where
  history lives; Supabase replaces it, nothing else changes. It is not
  Vercel-safe as is.
- **`find_video_tutorials` is SerpAPI, cached in `ui/.cache/youtube.json`**
  for seven days because SerpAPI bills per search. Without `SERPAPI_KEY` the
  tool is not registered and the model says it cannot offer videos.
- The data routes reach the mock server through `next.config.ts` rewrites of
  `/api/catalog|tutorials|health` to `CATALOG_API_URL`; `NEXT_PUBLIC_API_BASE_URL`
  is no longer set.
- Cart intents and image search were not ported. The review document reduced
  the cart to a saved list for an aggregator, and an uploaded photo gets a
  fixed "describe the part instead" reply.

Things that are easy to break:

- **Every page is statically prerendered at build time**, which means the
  first render runs in Node. Reading `window`/`localStorage` during render
  breaks the build or causes a hydration mismatch — read them in effects, as
  the data hooks already do. Anything calling `useSearchParams` must
  sit under a `<Suspense>` boundary (`CatalogScreen.tsx` provides it).

- **Filter state lives entirely in the query string**, so a filtered view is a
  shareable link and the back button works. Keep it there —
  [ui/src/hooks/useCatalog.ts](ui/src/hooks/useCatalog.ts) fetches `GET /catalog`
  for the current query string.
- **`chatbox.css` is untouched upstream styling.** The catalogue reframes the
  same `Chatbox` component into a corner launcher via `.chat-widget` in
  `catalog.css`, so `/assistant` still renders exactly as before. Do not fix one
  screen by editing the other's CSS.
- **`[ref]` comments in [ui/src/catalog.css](ui/src/catalog.css)** mark computed
  values measured off thepihut.com at a 1440px viewport. They are a reference to
  match, not arbitrary numbers. Two deliberate departures from DESIGN.md live
  there and are annotated inline.
- **The logo is one component.** [ui/src/components/Mark.tsx](ui/src/components/Mark.tsx)
  holds the geometry; the navbar, footer, chat header and launcher render it
  in `currentColor`. `public/logo.svg`, `public/advisor.svg` and the
  `app/icon.*` tab icons copy the same numbers by hand, so a change to the
  shape is five files (DESIGN.md §10, *The mark*).
- **Brand name, assistant name, categories, API base URL, and feature flags** are
  all in [ui/src/config/config.ts](ui/src/config/config.ts). Change them there and
  nowhere else. The navbar categories mirror the scraper's taxonomy in `enrich.py`.
  The API base URL defaults to `/api`; `next.config.ts` forwards the data
  routes to `CATALOG_API_URL` from `ui/.env` (gitignored; copy `.env.example`).
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` live in
  the same file and are the only two values meant for the browser.
- **Identity is `useAuth()` and nothing else.**
  [ui/src/context/AuthContext.tsx](ui/src/context/AuthContext.tsx) is the only
  file that observes the Supabase session; `ui/src/lib/supabase/*` are the only
  files that read the env variables. Sessions are cookies (`@supabase/ssr`), so
  route handlers can see the user too, and `src/proxy.ts` refreshes the token on
  every request — do not add redirects there; nothing on this site is behind a
  login wall. Reading is public everywhere. Writing on `/community` (post,
  reply, vote, delete) needs an account, and reviews are signed with the
  account's display name from the `profiles` table, which a trigger fills at
  sign-up. `status` starts as `"loading"` so pages disable their write controls
  rather than flash "Sign in" at someone who is signed in. Email confirmation
  is **off** on the project because Supabase's built-in mailer allows a few
  sends an hour and the free tier cannot edit the email templates; turn it on
  when real SMTP exists. Schema and settings:
  [docs/superpowers/specs/2026-09-19-supabase-auth-design.md](docs/superpowers/specs/2026-09-19-supabase-auth-design.md).
- **Tutorials are real and are not ours.** The page fetches `GET /tutorials` via
  [ui/src/hooks/useTutorials.ts](ui/src/hooks/useTutorials.ts); the old
  hand-written `ui/src/data/tutorials.ts` is gone. Every tutorial was written by
  someone on RobotShop's community site, so the title links out, the byline is
  on every card, and the parts table is headed *"Parts this tutorial mentions"*
  — not *"What you need"*. That wording is load-bearing: a lesson comparing
  three microcontrollers names all three, and a total that sums them describes
  a purchase nobody would make. Do not tighten it back up.
- **[ui/src/data/reviewStore.ts](ui/src/data/reviewStore.ts) is the only file that
  knows community reviews are Supabase rows** (`reviews`, `review_replies`,
  `review_votes`; schema and policies in
  [docs/superpowers/specs/2026-09-19-community-supabase-design.md](docs/superpowers/specs/2026-09-19-community-supabase-design.md)).
  The client never sends `author` or `author_id`: a `before insert` trigger
  stamps both from the session, and a trigger on `review_votes` maintains
  `reviews.helpful`, so a vote is one insert and the `(review_id, user_id)`
  primary key makes it one per account. "Yours" is `authorId === user.id`,
  the same rule RLS applies on delete. Nothing under `/community` reads
  `localStorage` any more; the old `servo.community.*` keys are dead. Every
  write throws a sentence the page shows as a toast, and the forms keep their
  text on failure. The tagged product is **denormalised into every review on
  purpose**: product ids are not stable across crawls, so a review holding only
  an id would lose its subject the first time the scraper ran.
- **The community page shares no code with tutorials.** `CommunityRail` is a
  deliberate sibling of `tutorials/FilterRail`, and `community.css` redeclares
  the tokens rather than importing `tutorials.css`. Sharing either would mean
  editing one screen to serve the other. Two pages with a checkbox list is a
  coincidence; lift a shared rail when a third one needs it.
- Guardrails are **not disabled** — only the on-screen toggle was removed. The
  value still comes from `config.features.guardrails.defaultState` and is still
  sent on every request.
- The app **no longer runs offline**: none of the 2,880 current products carry a
  `local_path`, so images resolve to remote supplier URLs. Re-run the scraper
  with `--images` to restore local copies. `ProductCard` degrades to a labelled
  "No photo" tile rather than a broken image.

## Migration path

The mock server is a scaffold, not the answer.
[docs/AGENT-ARCHITECTURE-REVIEW.md](docs/AGENT-ARCHITECTURE-REVIEW.md) is the
plan of record: **copy the blueprint's architecture, not its infrastructure** —
planner → specialist → grounded responder, memory in PostgreSQL, LLM output
validated by ordinary code before it reaches the database. Explicitly dropped:
GPUs and self-hosted NIMs, Milvus/etcd/MinIO (use `pgvector`), the NeMo
Guardrails container, image search. The first step of that migration is done:
the assistant is a model call with the catalogue as a tool, behind the same
`/query/stream` SSE contract, so the Chatbox never changed. What remains is the
data side — PostgreSQL in place of `robots.json`, and pgvector ranking on top
of the SQL filters.

For robots, **SQL is the authority and embeddings are the ranker** — similarity
search alone cannot answer "which robots support ROS 2".

[docs/PAGES.md](docs/PAGES.md) is the page roadmap, ordered by what the scraped
data can actually support. Product detail is next; price history, tutorials, and
seller profiles are blocked on data rather than on UI. The chat ↔ filter wiring
named there as the feature neither a plain catalogue nor a plain chatbot can
offer is half built: the assistant emits a `filters` frame; the catalogue does
not listen for it yet.

## Honesty about coverage

Several proposal features are visibly unpopulated, and the app says so rather
than faking it: `ros_support` is false throughout, so a ROS query explains that
the crawl covers a limited set of stores instead of returning an empty result;
only 62 products are listed on more than one site, so most comparisons are
spec-vs-spec rather than price-vs-price; price history needs repeat crawls before
it shows anything. When adding a feature, follow the same rule — an empty state
names what happened and what to do next (DESIGN.md §10, Voice).

The tutorial library follows it too, and the numbers are worth knowing before
you "fix" one of them:

| What | Coverage | Why |
|---|---|---|
| Tutorials indexed | 87 | Every archived `/tutorials/show/` page |
| With a parts list | 68 | The other 19 name nothing we stock, and say so on the card |
| With a thumbnail | 81 | The Archive never captured the other 6 |
| `runtimeSec` | 0 | The archived pages carry no video duration. The series name "Arduino 5 Minute Tutorials" is a claim about a series, not this lesson — do not launder it into a number |
| `verifiedBuild` | 0 | It means "we built this and checked it". Nothing scraped has earned it |

Coverage was deliberately traded for accuracy once already: requiring two
mentions before a generic part counts dropped priced tutorials from 76 to 68 and
removed a Rs 600 robot wheel from a lesson about inductors. If a change raises
the first number, check what it did to the second.

## Other agent configs

`~/.codex` and `~/.gemini` exist on this machine. Reply `/import` to scan and
list what is importable (MCP servers, slash commands, subagents, skills,
instructions), then `/import --yes=<digest>` with the digest from that scan to
apply the user-level items. If `/import` is unavailable on this surface, run
`claude import` from a terminal instead.
