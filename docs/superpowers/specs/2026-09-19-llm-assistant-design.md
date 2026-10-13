# Replace the regex assistant with an LLM that drives the catalogue filters

Date: 2026-09-19. Status: implemented. Branch: `nextjs-migration`.

Builds on [2026-09-19-nextjs-migration-design.md](2026-09-19-nextjs-migration-design.md)
and on Part B of [../../AGENT-ARCHITECTURE-REVIEW.md](../../AGENT-ARCHITECTURE-REVIEW.md).
This closes proposal objective 8 (a robotics assistant) with a real model, and
it is the first half of the chat ↔ filter wiring that `docs/PAGES.md` names as
the feature neither a plain catalogue nor a plain chatbot can offer.

## The problem being solved

The assistant today is `buildReply()` in `mock-server/server.js`: intent regexes
and a keyword scorer. It answers, but it cannot reason. The obvious replacement —
hand the model the catalogue — is off the table: 2,880 products at ~250 tokens
each is 700k tokens a turn.

The design principle throughout is the review document's: **the model proposes
a structured query, code validates and runs it, and the model only ever sees
what survived.** The catalogue's own filter surface (`GET /catalog`) is the
query language, so the assistant applies the same filters a shopper ticks in
the rail. Token cost per turn is bounded by the size of one trimmed result, not
by the size of the catalogue.

Second principle, from the same document: anything that can be done in code is
done in code. The model decides *whether* to search and *what to say*; code does
validation, ranking, trimming, arithmetic, caching, history, provider switching
and failure handling.

## Scope

In:

- A Next.js route handler that serves `POST /api/query/stream` with the same
  request body and SSE events the Chatbox already speaks.
- Two tools: `search_catalog` (over the mock server's `GET /catalog`) and
  `find_video_tutorials` (SerpAPI, YouTube engine, cached).
- Provider switching between Gemini and OpenAI, with automatic failover when
  one runs out of credits, and a fixed "assistant unavailable" reply when both
  have failed.
- The first UI-side unit tests, on the pure functions.
- Once the route handler passes the manual script below, the regex assistant
  is deleted from the mock server: `buildReply()`, its intent regexes, the
  glossary, the carts, `POST /query` and `POST /query/stream`. The mock server
  keeps `GET /catalog`, `GET /tutorials` and `GET /health`.

Out, and stated so nobody "fixes" the gap:

- Cart intents. The review document reduced the cart to a saved list for an
  aggregator; the regex cart is not ported.
- Image search. The body's `image` field gets a one-line "describe the part
  instead" reply.
- The catalogue *listening* to the new `filters` event. This spec emits it;
  wiring the rail is a separate change.
- A `search_tutorials` tool over the 87 indexed RobotShop tutorials.
- Persisting chat memory (Supabase) and deploying the route to Vercel.
- Any change to the mock server's *data* routes. It stays the catalogue and
  tutorial authority on port 8009; only its assistant is removed.

## Architecture

```
Chatbox ──POST /api/query/stream──> ui/src/app/api/query/stream/route.ts
                                      │ streamText({ model, system, messages, tools, stopWhen: stepCountIs(3) })
                                      ├─ tools/searchCatalog.ts ──GET──> mock-server :8009/catalog
                                      ├─ tools/findVideoTutorials.ts ──> SerpAPI (engine=youtube), cached on disk
                                      └─ every provider failed → one fixed "assistant unavailable" line, [DONE]
```

The turn shape is one `streamText` call from the Vercel AI SDK with two small
tools and a hard step cap. The alternative — a fixed extract → code → compose
pipeline — was considered and rejected: it needs a second prompt and a code
branch per intent, which is the regex router in a new costume.

### Files

All new code is server-side, under `ui/`.

| File | One job |
|---|---|
| `src/app/api/query/stream/route.ts` | Parse the existing body, run the turn, emit the existing SSE events, `[DONE]`. `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` |
| `src/agent/provider.ts` | Turn `LLM_PROVIDER` (an ordered list) into an AI SDK model, with failover |
| `src/agent/prompt.ts` | The static system prompt. Byte-stable so provider-side prefix caching applies where offered |
| `src/agent/tools/searchCatalog.ts` | Zod schema → `validate()` → fetch `/catalog` → `trim()` to the result the model sees |
| `src/agent/tools/findVideoTutorials.ts` | Zod schema → cache → SerpAPI → five trimmed videos |
| `src/agent/memory.ts` | Per-`user_id` history: in-memory `Map`, text only, last 12 messages |
| `src/agent/sse.ts` | Encode `{type, payload}` lines and `[DONE]`; the fixed replies (image, unavailable, mid-stream apology) live here too |
| `next.config.ts` | Rewrites `/api/catalog`, `/api/tutorials`, `/api/health` to `CATALOG_API_URL` |
| `.env`, `.env.example` | The server-side variables below |

Dependencies added to `ui/package.json`: `ai`, `@ai-sdk/google`, `@ai-sdk/openai`,
`zod`; dev: `vitest`.

### Routing and environment

Today `NEXT_PUBLIC_API_BASE_URL=http://localhost:8009` sends *every* API call to
the mock server. The chat route now lives in Next.js, so the split happens in
`next.config.ts` rewrites instead: `/api/catalog`, `/api/tutorials` and
`/api/health` forward to the mock server; `/api/query/stream` is served locally.
`NEXT_PUBLIC_API_BASE_URL` is dropped from `.env` so `config.ts` falls back to its
`/api` default. `config.ts` itself does not change.

Server-side variables (`ui/.env`, never `NEXT_PUBLIC_`):

| Variable | Meaning |
|---|---|
| `CATALOG_API_URL` | The mock server. Default `http://localhost:8009`. Read by the rewrites and by `searchCatalog.ts` |
| `LLM_PROVIDER` | Ordered, comma-separated: `gemini,openai`. First is primary |
| `LLM_MODEL_GEMINI`, `LLM_MODEL_OPENAI` | Optional model-id overrides. Defaults are set at implementation from each provider's current cheap tier |
| `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY` | Read by the AI SDK providers |
| `SERPAPI_KEY` | For `find_video_tutorials`. Missing key → the tool is not registered, so the model never offers videos |

The Docker/nginx deployment currently proxies all of `/api` to the backend; it
will need `/api/query/stream` routed to the Next.js container. That is a
deployment change and is not part of this spec.

## The turn

1. Parse `{user_id, query, guardrails, image, image_bool}` — the body the Chatbox
   sends today, unchanged.
2. If `image_bool` is true: stream one fixed sentence ("I can't search by photo
   yet — describe the part instead") and `[DONE]`. No model call.
3. Load the last 12 messages for `user_id` from `memory.ts`.
4. `streamText({ model, system, messages: [...history, user], tools, stopWhen: stepCountIs(3) })`.
   Three steps is search → optional one refinement → answer. A model that wants
   to keep searching is cut off.
5. Each text delta → `data: {"type":"content","payload":"…"}`.
6. On finish, if `search_catalog` ran this turn: emit `products` with the **full**
   cards for the `top` of the **last** search, then `filters` with that search's
   `applied` object. Then `[DONE]`. The model never chooses which cards to show —
   the UI shows exactly what the tool returned, so the model cannot describe a
   product that is not on screen (the review document's per-turn allowlist).
7. Append the user text and the assistant text to history. Tool calls and tool
   results are **not** persisted. A ten-turn conversation replays ~600 tokens of
   prose, not thousands of tokens of stale search results.
8. Log one line: provider used, steps, `usage.inputTokens` / `outputTokens`,
   milliseconds per stage. These are the latency and cost numbers for the
   evaluation chapter.

Measured cost per turn on 2026-09-19 with `gemini-2.5-flash`, from the route's
own log (`in` / `out` tokens, all steps summed):

| Query | Steps | In | Out | ms |
|---|---|---|---|---|
| "hi" | 1 | 840 | 32 | 1,585 |
| "ultrasonic sensor under Rs 500" | 2 | 2,084 | 224 | 2,369 |
| "sensors for Arduino" (137 matches, facets included) | 2 | 2,784 | 356 | 10,438 |
| "which of those is cheapest" (no new search) | 1 | 1,156 | 84 | 1,078 |
| "what does I2C mean" | 1 | 1,196 | 112 | 1,561 |
| "robots with ROS 2" | 1 | 1,321 | 492 | 3,155 |

The pre-build estimate was 2,000–2,300 per turn; a turn with one search lands
at 2,100–2,800 and every turn without one under 1,400. The Gemini free tier
allows five `gemini-2.5-flash` requests a minute, which the eight-query script
exceeded — the failover engaged and the fixed line was shown. Set
`LLM_MODEL_GEMINI=gemini-2.5-flash-lite` or a paid key for a demo audience.

### System prompt

Static, roughly 400 tokens, kept byte-stable. Its rules:

- Role: Servo's Robot Advisor for a catalogue aggregated from Pakistani
  robotics stores — parts, modules and kits, not full ROS platforms.
- Only name products that `search_catalog` returned this turn. Never state a
  spec or a price the tool did not give. Quote prices as the tool formats them.
- Search for any product, part, price or recommendation request. Do not search
  for greetings, for jargon ("what does I2C mean" — answer from knowledge in at
  most three sentences), or for follow-ups about cards already shown.
- If `total > shown`: either re-run with a `sort` or ask **one** narrowing
  question using `facets`. Never more than one refinement.
- On an empty result: say what the catalogue covers. For ROS, use the honesty
  line from `CLAUDE.md` — the crawl covers a limited set of stores that sell
  components rather than ROS platforms.
- Call `find_video_tutorials` only when the user asks how to use, wire, program
  or learn something. Present results as markdown links.
- At most 120 words. Markdown lists, no tables.
- Stay on robotics and electronics shopping; answer anything else in one line.
  This rule is included when the body's `guardrails` is true (it always is
  today) and omitted when false — the flag keeps its meaning.

### Providers and failure

`LLM_PROVIDER=gemini,openai` is an ordered list. `provider.ts` tries the first;
any failure **before the first token** — bad key, no credits, rate limit,
outage, network — moves to the next; when the list
is exhausted, the route streams one fixed line — the assistant is unavailable,
the catalogue and filters still work — and `[DONE]`. A dead key degrades the
assistant, never the page. The regex assistant is not kept as a further tier:
it is deleted once the manual script passes.

A failure **after** the first token cannot be retried without duplicating text.
Emit one apology line as `content`, then `[DONE]`. The Chatbox must never be
left spinning.

## Tool contracts

### `search_catalog`

Input — every field optional; the Zod `.describe()` text is the model's
documentation:

| Field | Type | Becomes |
|---|---|---|
| `q` | string | `q=` — one keyword, substring-matched on name, brand and category |
| `category` | enum of the 14 values the catalogue actually has | `category=` |
| `platform` | array of the 9 real platforms | repeated `platform=` |
| `skill` | `Beginner` \| `Intermediate` \| `Advanced` | `skill=` |
| `minPrice`, `maxPrice` | number, PKR | `minPrice=` / `maxPrice=` |
| `inStock` | boolean | `inStock=true` |
| `sort` | `featured` \| `price-asc` \| `price-desc` \| `sellers-desc` | `sort=` — "cheapest" is a sort, never model arithmetic |

The enum values are fixed in code from the current facets. If a crawl adds a
category, the enum is updated by hand; a stale enum degrades to the model
using `q` instead, not to an error.

`validate()` runs before the fetch: drop `maxPrice <= 0` (the review document's
"LLMs fill optional prices with 0" bug), swap inverted `minPrice`/`maxPrice`,
strip individual enum values that fail rather than rejecting the whole call.

`trim()` runs after the fetch. What the model sees:

```json
{
  "total": 312, "shown": 6,
  "applied": { "category": "Sensors", "maxPrice": 2000 },
  "top": [
    { "id": "…", "name": "…", "brand": "…", "price": "Rs 350", "pricePkr": 350,
      "platforms": ["Arduino"], "skill": "Beginner", "sellers": 2, "inStock": true }
  ],
  "facets": { "category": [["Sensors", 40]], "platform": [["Arduino", 31]], "price": [["under-500", 120]] },
  "withoutKeyword": 48
}
```

- `top` is six cards of nine fields, about 35 tokens each. The full cards from
  the same response are kept in a per-turn `retrieved` map for the `products`
  event. The constant is one number; six is the starting value.
- `facets` — top six per group — is present **only when `total > shown`**. It is
  what lets the model narrow instead of listing, and it is omitted when the
  result is already small.
- `withoutKeyword` is present **only when `total === 0` and `q` was set**. Code
  re-runs the same filters once without `q`, so the model can say "nothing
  called X, but 48 sensors under Rs 2,000" from data rather than guessing.

### `find_video_tutorials`

Input: `{ query: string }`, e.g. `"HC-SR04 Arduino"`.

Code: look up the cache (an in-memory `Map` written through to a JSON file
under `ui/.cache/`, which is gitignored; entries expire after seven days) →
on a miss, SerpAPI with `engine=youtube` → keep five results.

Output: five `{ title, channel, url, duration }` objects, about 50 tokens each.
The model writes them as markdown links; the Chatbox already renders markdown.
No new SSE event.

The cache exists because SerpAPI bills per search, not because of tokens.
YouTube Data API v3 returns the same fields free within its daily quota; the
fetch is isolated in one function so swapping it is a one-function change.

## Memory

`memory.ts` is the only file that knows where history lives — the same
isolation as `reviewStore.ts`. Today: an in-memory `Map<userId, Message[]>`
capped at twelve entries, text only. This is correct for `next dev` and the
demo. It is **not** correct on Vercel, where route handlers are stateless; the
move to Supabase rewrites this one file.

The Chatbox generates `user_id` per browser session and never sends history,
so the server has to hold it. Sending history from the client was considered
and declined for now, to keep the request body identical to the mock server's.

## Verification

Automated — the repository's first UI-side tests, with vitest, on pure
functions only. No network, no model.

- `searchCatalog.validate()`: drops `maxPrice: 0`; swaps inverted min/max;
  strips an unknown platform and keeps the call.
- `searchCatalog.trim()`: nine-field card; `facets` present iff `total > shown`;
  `withoutKeyword` present iff `total === 0 && q`.
- `memory`: caps at twelve; stores text only.
- `provider`: `"gemini,openai"` parses in order; a failure before output on
  the first moves to the second; an exhausted list reports null.
- The scraper's rule applies here: every bug found later becomes a case.

Existing bar: `npx tsc --noEmit`, `npm run lint`, `npm run build` clean.

Manual, against the running mock server, with the per-turn usage log open.
The measured token counts are recorded in this file afterwards, replacing the
estimate above.

| Query | Expected path |
|---|---|
| "hi" | no tool; greeting |
| "ultrasonic sensor under Rs 500" | one search; ≤6 cards; `filters` event |
| "sensors for Arduino" | search → `total > shown` → one narrowing question, or a sorted top six |
| "which of those is cheapest" | no new search; answers from the cards on screen |
| "what does I2C mean" | no tool; ≤3 sentences |
| "how do I use the HC-SR04" | `find_video_tutorials`; five links; the second run logs a cache hit |
| "robots with ROS 2" | search → 0 → the honesty line |
| "write me a poem" | one-line refusal |
| Invalidate the primary key mid-session | next provider engages; with both invalid, the fixed unavailable line; the Chatbox always receives `[DONE]` |

After the script passes: delete the assistant from `mock-server/server.js`
(`buildReply`, `searchRobots`, `parseFilters`/`applyFilters`, the intent
regexes, `GLOSSARY`, `carts`/`lastShown`, `handleStream`, `handleQuery`, and
the `/query` routes) and re-run the script to prove nothing in the UI still
depends on it. `toCard`, `formatPrice` and the catalogue functions stay.

## Docs updated in the same change

- `CLAUDE.md`: commands (`npm test`), the architecture diagram (the route
  handler between the Chatbox and the mock server), the environment variables,
  the sentence saying there are no UI tests, the mock server route table
  (`/query*` gone) and the `buildReply()` paragraph and *Migration path*
  wording that describe replacing regexes "one at a time".
- `ui/.env.example`: the new variables, with the `NEXT_PUBLIC_API_BASE_URL`
  line removed.
- `docs/PAGES.md`, "Not yet wired: chat ↔ filters": the `filters` event now
  exists server-side; only the catalogue's listener is missing.
- `docs/AGENT-ARCHITECTURE-REVIEW.md`: no edit. Its B6 diagram names LangGraph
  and FastAPI; this spec is the same shape on the AI SDK in the Next.js app,
  and that difference is recorded here rather than by rewriting the review.
