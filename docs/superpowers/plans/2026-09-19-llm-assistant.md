# LLM Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock server's regex assistant with a Next.js route handler that runs one LLM call with two small tools over the existing catalogue filters, then delete the regex assistant.

**Architecture:** `POST /api/query/stream` in `ui/` calls `streamText` (Vercel AI SDK 7) with `search_catalog` (wraps the mock server's `GET /catalog`, returns ≤6 trimmed cards plus facet counts) and `find_video_tutorials` (SerpAPI YouTube, disk-cached). Gemini and OpenAI are tried in `LLM_PROVIDER` order; a failure before the first token moves to the next provider; when all fail the route streams one fixed line. The SSE bytes are identical to what the mock server emitted, so the Chatbox does not change. Spec: [../specs/2026-09-19-llm-assistant-design.md](../specs/2026-09-19-llm-assistant-design.md).

**Tech Stack:** Next 16 App Router route handler (Node runtime), `ai@7`, `@ai-sdk/google@4`, `@ai-sdk/openai@4`, `zod@4`, `vitest@5`. Node 22 (installed: 22.19).

**Working branch:** `nextjs-migration`. Commit after every task.

**Verified API facts (ai@7, checked 2026-09-19):** the system prompt parameter is `instructions` (not `system`); the step cap is `stopWhen: isStepCount(n)` (not `stepCountIs`); tools are `tool({ description, inputSchema, execute })`; a tool call's arguments are `.input` and its result `.output`; `fullStream` emits `{ type: 'text-delta', text }` and `{ type: 'error', error }`; message type is `ModelMessage`; usage fields are `inputTokens` / `outputTokens`; the providers read `GOOGLE_GENERATIVE_AI_API_KEY` and `OPENAI_API_KEY`.

---

## File map

| Path (under `ui/`) | Responsibility |
|---|---|
| `src/agent/sse.ts` | SSE encoding, response headers, the three fixed replies |
| `src/agent/memory.ts` | Per-user history, in-memory, text only, last 12 |
| `src/agent/provider.ts` | Provider list parsing, model factory, failover loop |
| `src/agent/prompt.ts` | The system prompt |
| `src/agent/tools/searchCatalog.ts` | Schema, `validate`, `buildQuery`, `trim`, `toRobotCard`, `runSearch`, the tool |
| `src/agent/tools/findVideoTutorials.ts` | File cache, SerpAPI fetch, the tool |
| `src/agent/tools/index.ts` | `TurnState` and `makeTools(turn)` |
| `src/app/api/query/stream/route.ts` | The turn |
| `src/agent/*.test.ts`, `src/agent/tools/*.test.ts` | vitest, pure functions only |
| `vitest.config.ts`, `package.json` | Test runner |
| `next.config.ts`, `.env`, `.env.example` | Routing and environment |
| `mock-server/server.js` | Assistant removed at the end |
| `CLAUDE.md`, `docs/PAGES.md`, `.gitignore` | Docs |

---

### Task 1: Dependencies, test runner, environment

**Files:**
- Modify: `ui/package.json`
- Create: `ui/vitest.config.ts`
- Modify: `ui/.env.example`, `ui/.env`
- Modify: `.gitignore` (repo root)

- [ ] **Step 1: Install the packages**

Run from `ui/`:
```bash
npm install ai@^7 @ai-sdk/google@^4 @ai-sdk/openai@^4 zod@^4
npm install -D vitest@^5
```
Expected: `package.json` gains the four dependencies and `vitest` under devDependencies; no peer-dependency errors. If npm reports a peer conflict between `ai` and a provider package, run `npm view ai@7 peerDependencies` and match the provider majors it lists.

- [ ] **Step 2: Add the test script**

In `ui/package.json`, inside `"scripts"`, add:
```json
"test": "vitest run",
```

- [ ] **Step 3: Create the vitest config**

Create `ui/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

// Pure-function tests only: no network, no model, no DOM. The route handler is
// exercised by the manual script in the spec, not here.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Run vitest to confirm it starts with zero tests**

Run: `npm test`
Expected: exits 0 with "No test files found" (vitest 5 treats this as a pass unless `passWithNoTests` is false — if it exits 1, add `passWithNoTests: true` to the config's `test` block).

- [ ] **Step 5: Rewrite `.env.example`**

Replace the whole of `ui/.env.example` with:
```bash
# Copy to .env for local development.
#
# Everything here is server-side. Nothing is prefixed NEXT_PUBLIC_, so none of
# it reaches the browser bundle. The UI itself calls `/api/...` on its own
# origin: next.config.ts forwards /api/catalog, /api/tutorials and /api/health
# to the mock server below, and serves /api/query/stream (the assistant) itself.

# The mock server (`cd mock-server && node server.js`): catalogue + tutorials.
CATALOG_API_URL=http://localhost:8009

# Assistant providers, in the order to try them. When the first fails before
# it has produced any text (bad key, no credits, rate limit, outage) the next
# one is tried. When all fail the assistant says so and the catalogue keeps
# working.
LLM_PROVIDER=gemini,openai
GOOGLE_GENERATIVE_AI_API_KEY=
OPENAI_API_KEY=

# Optional model overrides. Defaults are in src/agent/provider.ts.
# LLM_MODEL_GEMINI=gemini-2.5-flash
# LLM_MODEL_OPENAI=gpt-5-mini

# Optional. SerpAPI key for YouTube tutorial search. Without it the
# find_video_tutorials tool is not registered and the assistant never
# offers videos. Results are cached in ui/.cache/youtube.json for 7 days
# because SerpAPI bills per search.
SERPAPI_KEY=
```

- [ ] **Step 6: Update the local `.env`**

`ui/.env` is gitignored. Replace its contents with the same block as `.env.example`, then fill in whichever of `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `SERPAPI_KEY` you have. Delete the `NEXT_PUBLIC_API_BASE_URL` line — with it gone, `config.ts` falls back to `/api`, which is what the rewrites in Task 9 expect.

- [ ] **Step 7: Gitignore the YouTube cache**

In the repo-root `.gitignore`, after the `scraper/.cache_tutorials/` block, add:
```gitignore
# SerpAPI results for the assistant's find_video_tutorials tool. A cost
# optimisation (SerpAPI bills per search), rebuilt on demand.
ui/.cache/
```

- [ ] **Step 8: Commit**

```bash
git add ui/package.json ui/package-lock.json ui/vitest.config.ts ui/.env.example .gitignore
git commit -m "Add the AI SDK, vitest and the assistant's environment variables"
```

---

### Task 2: SSE encoding and fixed replies

**Files:**
- Create: `ui/src/agent/sse.ts`
- Test: `ui/src/agent/sse.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `ui/src/agent/sse.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DONE, encodeEvent, fixedReply } from "./sse";

describe("encodeEvent", () => {
  it("emits one SSE data line with a blank line after it", () => {
    expect(encodeEvent({ type: "content", payload: "hi" })).toBe(
      'data: {"type":"content","payload":"hi"}\n\n'
    );
  });

  it("keeps newlines inside the payload escaped so the frame stays one line", () => {
    const frame = encodeEvent({ type: "content", payload: "a\nb" });
    expect(frame.split("\n")).toHaveLength(3); // data line, blank, trailing empty
  });
});

describe("DONE", () => {
  it("is the sentinel the Chatbox stops on", () => {
    expect(DONE).toBe("data: [DONE]\n\n");
  });
});

describe("fixedReply", () => {
  it("streams the text as one content event followed by [DONE]", async () => {
    const response = fixedReply("nope");
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const body = await new Response(response.body).text();
    expect(body).toBe(
      'data: {"type":"content","payload":"nope"}\n\n' + "data: [DONE]\n\n"
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/agent/sse.test.ts`
Expected: FAIL — cannot find module `./sse`.

- [ ] **Step 3: Write `sse.ts`**

Create `ui/src/agent/sse.ts`:
```ts
/**
 * The wire format the Chatbox parses: `data: {"type","payload"}` frames and a
 * final `data: [DONE]`. These are the same bytes mock-server/server.js used to
 * emit, so the UI does not know the assistant moved.
 */

import type { RobotCard } from "../types";

export type SseEvent =
  | { type: "content"; payload: string }
  | { type: "products"; payload: RobotCard[] }
  /** The filters the assistant applied — the hook for the catalogue rail. */
  | { type: "filters"; payload: Record<string, unknown> };

export function encodeEvent(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export const DONE = "data: [DONE]\n\n";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/**
 * Replies that cost no tokens. Each names what happened and what to do next,
 * the empty-state rule from DESIGN.md §8.
 */
export const FIXED_REPLIES = {
  image:
    "I can't search by photo yet — describe the part instead (its name, what it does, or the board it is for) and I'll find it in the catalogue.",
  unavailable:
    "The assistant is unavailable right now — none of its language-model providers answered. The catalogue and its filters still work; try the filter rail.",
  interrupted:
    "\n\n…sorry, I lost the connection mid-answer. Ask again and I'll pick it up.",
} as const;

/** A complete SSE response containing one content frame and [DONE]. */
export function fixedReply(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(encodeEvent({ type: "content", payload: text })));
      controller.enqueue(encoder.encode(DONE));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/agent/sse.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add ui/src/agent/sse.ts ui/src/agent/sse.test.ts
git commit -m "Add the assistant's SSE encoder and fixed replies"
```

---

### Task 3: Memory

**Files:**
- Create: `ui/src/agent/memory.ts`
- Test: `ui/src/agent/memory.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `ui/src/agent/memory.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { forget, history, remember } from "./memory";

describe("memory", () => {
  beforeEach(() => forget("u1"));

  it("starts empty", () => {
    expect(history("u1")).toEqual([]);
  });

  it("stores one user and one assistant message per exchange, as plain text", () => {
    remember("u1", "hi", "hello");
    expect(history("u1")).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("keeps only the last 12 messages, dropping the oldest first", () => {
    for (let i = 1; i <= 7; i += 1) remember("u1", `q${i}`, `a${i}`);
    const kept = history("u1");
    expect(kept).toHaveLength(12);
    expect(kept[0]).toEqual({ role: "user", content: "q2" });
    expect(kept[11]).toEqual({ role: "assistant", content: "a7" });
  });

  it("isolates users", () => {
    remember("u1", "a", "b");
    expect(history("u2")).toEqual([]);
  });

  it("returns a copy, so callers cannot mutate the store", () => {
    remember("u1", "a", "b");
    history("u1").push({ role: "user", content: "injected" });
    expect(history("u1")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/agent/memory.test.ts`
Expected: FAIL — cannot find module `./memory`.

- [ ] **Step 3: Write `memory.ts`**

Create `ui/src/agent/memory.ts`:
```ts
/**
 * Per-user conversation history for the assistant.
 *
 * This is the only file that knows where history lives — the same isolation
 * as data/reviewStore.ts. Today it is an in-memory Map, which is right for
 * `next dev` and the demo and wrong for a stateless host such as Vercel; the
 * move to Supabase rewrites this file and nothing else.
 *
 * Two rules keep the model's context small:
 *   - Text only. Tool calls and tool results are never stored, so a ten-turn
 *     chat replays ~600 tokens of prose rather than thousands of tokens of
 *     stale search results.
 *   - Twelve messages (six exchanges). Older ones are dropped, not summarised.
 */

import type { ModelMessage } from "ai";

const MAX_MESSAGES = 12;

const store = new Map<string, ModelMessage[]>();

export function history(userId: string): ModelMessage[] {
  return [...(store.get(userId) ?? [])];
}

export function remember(userId: string, userText: string, assistantText: string): void {
  const next: ModelMessage[] = [
    ...history(userId),
    { role: "user", content: userText },
    { role: "assistant", content: assistantText },
  ];
  store.set(userId, next.slice(-MAX_MESSAGES));
}

export function forget(userId: string): void {
  store.delete(userId);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/agent/memory.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add ui/src/agent/memory.ts ui/src/agent/memory.test.ts
git commit -m "Add the assistant's in-memory history"
```

---

### Task 4: Providers and failover

**Files:**
- Create: `ui/src/agent/provider.ts`
- Test: `ui/src/agent/provider.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `ui/src/agent/provider.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseProviderList, withFailover } from "./provider";

describe("parseProviderList", () => {
  it("keeps the configured order", () => {
    expect(parseProviderList("openai,gemini")).toEqual(["openai", "gemini"]);
  });

  it("defaults to gemini then openai when unset or empty", () => {
    expect(parseProviderList(undefined)).toEqual(["gemini", "openai"]);
    expect(parseProviderList("")).toEqual(["gemini", "openai"]);
  });

  it("ignores case, whitespace, duplicates and unknown names", () => {
    expect(parseProviderList(" OpenAI , gemini, openai, claude ")).toEqual(["openai", "gemini"]);
  });

  it("falls back to the default when nothing is recognised", () => {
    expect(parseProviderList("claude")).toEqual(["gemini", "openai"]);
  });
});

describe("withFailover", () => {
  it("returns the first provider that completes", async () => {
    const tried: string[] = [];
    const used = await withFailover(["gemini", "openai"], async (name) => {
      tried.push(name);
      return "completed";
    });
    expect(used).toBe("gemini");
    expect(tried).toEqual(["gemini"]);
  });

  it("moves to the next provider when one fails before producing output", async () => {
    const used = await withFailover(["gemini", "openai"], async (name) =>
      name === "gemini" ? "failed-before-output" : "completed"
    );
    expect(used).toBe("openai");
  });

  it("returns null when every provider fails", async () => {
    const used = await withFailover(["gemini", "openai"], async () => "failed-before-output");
    expect(used).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/agent/provider.test.ts`
Expected: FAIL — cannot find module `./provider`.

- [ ] **Step 3: Write `provider.ts`**

Create `ui/src/agent/provider.ts`:
```ts
/**
 * Which language model answers, and what happens when it cannot.
 *
 * `LLM_PROVIDER` is an ordered list ("gemini,openai"). The route tries each in
 * turn; an attempt that fails before it has streamed any text — bad key, no
 * credits, rate limit, outage — hands over to the next. The AI SDK gives every
 * provider the same `streamText` interface, so switching is one env var.
 *
 * Model ids are read from the environment so a retired id is a config change,
 * not a deploy. Both defaults are each provider's cheap tool-capable tier.
 */

import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type ProviderName = "gemini" | "openai";

const DEFAULT_ORDER: ProviderName[] = ["gemini", "openai"];

const DEFAULT_MODEL: Record<ProviderName, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-5-mini",
};

function isProviderName(value: string): value is ProviderName {
  return value === "gemini" || value === "openai";
}

export function parseProviderList(raw: string | undefined): ProviderName[] {
  const names = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(isProviderName);
  const unique = [...new Set(names)];
  return unique.length > 0 ? unique : [...DEFAULT_ORDER];
}

export function modelFor(
  name: ProviderName,
  env: NodeJS.ProcessEnv = process.env
): LanguageModel {
  if (name === "openai") return openai(env.LLM_MODEL_OPENAI || DEFAULT_MODEL.openai);
  return google(env.LLM_MODEL_GEMINI || DEFAULT_MODEL.gemini);
}

export type AttemptOutcome = "completed" | "failed-before-output";

/**
 * Runs `attempt` for each provider until one completes. Returns the provider
 * that did, or null when the list is exhausted. An attempt that has already
 * streamed text must report "completed" even if it later broke — retrying it
 * would duplicate the text the user has seen.
 */
export async function withFailover(
  providers: ProviderName[],
  attempt: (name: ProviderName) => Promise<AttemptOutcome>
): Promise<ProviderName | null> {
  for (const name of providers) {
    if ((await attempt(name)) === "completed") return name;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/agent/provider.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If `LanguageModel` is not exported from `ai`, run `grep -n "export type LanguageModel" node_modules/ai/dist/index.d.ts` and use the name it exports (`LanguageModel` is the documented one in v5–v7).

- [ ] **Step 6: Commit**

```bash
git add ui/src/agent/provider.ts ui/src/agent/provider.test.ts
git commit -m "Add provider selection and failover for the assistant"
```

---

### Task 5: The `search_catalog` tool

**Files:**
- Create: `ui/src/agent/tools/searchCatalog.ts`
- Test: `ui/src/agent/tools/searchCatalog.test.ts`

The tool is four pure functions plus one that fetches. Tests cover the pure ones and `runSearch` with an injected `fetch`.

- [ ] **Step 1: Write the failing tests**

Create `ui/src/agent/tools/searchCatalog.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { CatalogResponse } from "../../types/catalog";
import {
  SHOWN,
  buildQuery,
  runSearch,
  toRobotCard,
  trim,
  validate,
  type CatalogRobot,
} from "./searchCatalog";

function robot(overrides: Partial<CatalogRobot> = {}): CatalogRobot {
  return {
    id: "r1",
    name: "HC-SR04 Ultrasonic Sensor",
    brand: "Generic",
    category: "Sensors",
    subcategory: null,
    summary: "",
    image: "https://example.test/a.jpg",
    price: 350,
    currency: "PKR",
    pricePkr: 350,
    offerCount: 2,
    hasVerifiedSeller: false,
    skill: "Beginner",
    platforms: ["Arduino"],
    inStock: true,
    tutorials: 0,
    sourceUrl: "https://example.test/a",
    ...overrides,
  };
}

function response(overrides: Partial<CatalogResponse> = {}): CatalogResponse {
  return {
    total: 1,
    page: 1,
    pageSize: 48,
    pageCount: 1,
    sort: "featured",
    products: [robot()],
    facets: {
      category: [{ value: "Sensors", count: 40 }, { value: "Power", count: 2 }],
      platform: [{ value: "Arduino", count: 31 }],
      skill: [{ value: "Beginner", count: 10 }],
      price: [{ value: "under-500", label: "Under Rs 500", count: 12 }],
      inStock: 30,
      priceRange: { min: 1, max: 9000 },
    },
    ...overrides,
  };
}

describe("validate", () => {
  it("drops a zero or negative maxPrice — models fill optional prices with 0", () => {
    expect(validate({ maxPrice: 0 }).applied).toEqual({});
    expect(validate({ maxPrice: -5 }).applied).toEqual({});
  });

  it("swaps an inverted price range", () => {
    expect(validate({ minPrice: 2000, maxPrice: 500 }).applied).toEqual({ minPrice: 500, maxPrice: 2000 });
  });

  it("normalises enum values by case and strips unknown ones without failing", () => {
    const { applied, dropped } = validate({
      category: "sensors",
      platform: ["arduino", "Commodore 64", "raspberry pi"],
      skill: "beginner",
      sort: "cheapest",
    });
    expect(applied).toEqual({ category: "Sensors", platform: ["Arduino", "Raspberry Pi"], skill: "Beginner" });
    expect(dropped).toEqual(["platform: Commodore 64", "sort: cheapest"]);
  });

  it("drops a category it does not know rather than sending it", () => {
    expect(validate({ category: "Drones" }).applied).toEqual({});
  });

  it("keeps q trimmed and lower-cased, and drops it when blank", () => {
    expect(validate({ q: "  L298N " }).applied).toEqual({ q: "l298n" });
    expect(validate({ q: "   " }).applied).toEqual({});
  });
});

describe("buildQuery", () => {
  it("repeats multi-select params and omits absent ones", () => {
    const query = buildQuery({ category: "Sensors", platform: ["Arduino", "ESP32"], maxPrice: 500, inStock: true });
    expect(query).toBe("category=Sensors&platform=Arduino&platform=ESP32&maxPrice=500&inStock=true");
  });

  it("encodes spaces and ampersands", () => {
    expect(buildQuery({ category: "Display & Audio", q: "oled display" })).toBe("q=oled+display&category=Display+%26+Audio");
  });
});

describe("trim", () => {
  it("returns nine-field cards and no facets when everything fits", () => {
    const result = trim(response(), { category: "Sensors" });
    expect(result).toEqual({
      total: 1,
      shown: 1,
      applied: { category: "Sensors" },
      top: [
        {
          id: "r1",
          name: "HC-SR04 Ultrasonic Sensor",
          brand: "Generic",
          price: "Rs 350",
          pricePkr: 350,
          platforms: ["Arduino"],
          skill: "Beginner",
          sellers: 2,
          inStock: true,
        },
      ],
    });
  });

  it("adds facets only when there is more than it shows", () => {
    const many = response({ total: 312, products: Array.from({ length: 10 }, (_, i) => robot({ id: `r${i}` })) });
    const result = trim(many, {});
    expect(result.shown).toBe(SHOWN);
    expect(result.top).toHaveLength(SHOWN);
    expect(result.facets).toEqual({
      category: [["Sensors", 40], ["Power", 2]],
      platform: [["Arduino", 31]],
      price: [["under-500", 12]],
    });
  });

  it("caps each facet group at six entries", () => {
    const many = response({
      total: 100,
      products: Array.from({ length: 10 }, (_, i) => robot({ id: `r${i}` })),
      facets: {
        ...response().facets,
        category: Array.from({ length: 9 }, (_, i) => ({ value: `c${i}`, count: 9 - i })),
      },
    });
    expect(trim(many, {}).facets?.category).toHaveLength(6);
  });

  it("quotes USD listings in dollars", () => {
    const usd = response({ products: [robot({ price: 12, currency: "USD", pricePkr: 3360 })] });
    expect(trim(usd, {}).top[0].price).toBe("$12");
  });
});

describe("toRobotCard", () => {
  it("produces the shape ChatMessage's product_row renders", () => {
    const card = toRobotCard(robot({ hasVerifiedSeller: true, languages: ["C/C++"], os: ["Linux"], ros: null, ageMin: 14, sellers: [] }));
    expect(card).toEqual({
      id: "r1",
      name: "HC-SR04 Ultrasonic Sensor",
      brand: "Generic",
      category: "Sensors",
      image: "https://example.test/a.jpg",
      price: 350,
      priceLabel: "Rs 350",
      offerCount: 2,
      verified: true,
      ageMin: 14,
      ageMax: undefined,
      skill: "Beginner",
      platforms: ["Arduino"],
      languages: ["C/C++"],
      os: ["Linux"],
      ros: null,
      dof: undefined,
      tutorials: 0,
      sellers: [],
    });
  });
});

describe("runSearch", () => {
  const fetchJson = (body: CatalogResponse) =>
    (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;

  it("fetches once and returns the trimmed result plus the full cards", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(response()));
    }) as unknown as typeof fetch;

    const { result, cards, dropped } = await runSearch({ category: "sensors" }, { fetch: fetchImpl, baseUrl: "http://mock" });
    expect(calls).toEqual(["http://mock/catalog?category=Sensors"]);
    expect(result.total).toBe(1);
    expect(cards).toHaveLength(1);
    expect(cards[0].priceLabel).toBe("Rs 350");
    expect(dropped).toEqual([]);
  });

  it("re-runs without the keyword when the keyword found nothing", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      const empty = url.includes("q=");
      return new Response(JSON.stringify(response({ total: empty ? 0 : 48, products: empty ? [] : [robot()] })));
    }) as unknown as typeof fetch;

    const { result } = await runSearch({ q: "flux capacitor", category: "Sensors" }, { fetch: fetchImpl, baseUrl: "http://mock" });
    expect(calls).toEqual(["http://mock/catalog?q=flux+capacitor&category=Sensors", "http://mock/catalog?category=Sensors"]);
    expect(result.total).toBe(0);
    expect(result.withoutKeyword).toBe(48);
  });

  it("does not re-run when there was no keyword", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(response({ total: 0, products: [] })));
    }) as unknown as typeof fetch;
    const { result } = await runSearch({ category: "Sensors" }, { fetch: fetchImpl, baseUrl: "http://mock" });
    expect(calls).toHaveLength(1);
    expect(result.withoutKeyword).toBeUndefined();
  });

  it("reports an unreachable catalogue as a result the model can read, not an exception", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const { result, cards } = await runSearch({}, { fetch: fetchImpl, baseUrl: "http://mock" });
    expect(result).toEqual({ error: "The catalogue service is unreachable. Tell the user to try again in a moment." });
    expect(cards).toEqual([]);
  });

  it("uses the injected fetch even for the trimmed default", async () => {
    const { result } = await runSearch({}, { fetch: fetchJson(response()), baseUrl: "http://mock" });
    expect("total" in result && result.total).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/agent/tools/searchCatalog.test.ts`
Expected: FAIL — cannot find module `./searchCatalog`.

- [ ] **Step 3: Write `searchCatalog.ts`**

Create `ui/src/agent/tools/searchCatalog.ts`:
```ts
/**
 * `search_catalog` — the assistant's only way of knowing what is for sale.
 *
 * The model proposes a filter; this file validates it, runs it against the
 * mock server's GET /catalog (the same facets a shopper ticks in the rail),
 * and hands back a result small enough to reason over: at most SHOWN trimmed
 * cards plus facet counts. The model never sees the catalogue, only what
 * survived the filter. See docs/superpowers/specs/2026-09-19-llm-assistant-design.md.
 *
 * Everything the model must not be trusted with happens here in code:
 * normalising enum values, dropping the `maxPrice: 0` that models emit when no
 * budget was given, price formatting, and the "nothing matched — but without
 * the keyword N would" re-query.
 */

import { tool } from "ai";
import { z } from "zod";
import type { CatalogProduct, CatalogResponse, FacetOption } from "../../types/catalog";
import type { RobotCard, RobotSeller } from "../../types";

// ---------------------------------------------------------------- vocabulary
//
// Fixed from the facets the current crawl produces. A crawl that adds a
// category means adding it here; until then the model falls back to `q`.

export const CATEGORIES = [
  "Prototyping",
  "Sensors",
  "Controllers",
  "Power",
  "Display & Audio",
  "Tools",
  "Uncategorised",
  "Motors & Actuators",
  "Robot Kits",
  "Communication",
  "Accessories",
  "Mechanical",
  "Robots",
  "Service & Industrial Robots",
] as const;

export const PLATFORMS = [
  "Arduino",
  "Raspberry Pi",
  "ESP32",
  "STM32",
  "ESP8266",
  "PIC",
  "NVIDIA Jetson",
  "Nvidia/PC",
  "micro:bit",
] as const;

export const SKILLS = ["Beginner", "Intermediate", "Advanced"] as const;

export const SORTS = ["featured", "price-asc", "price-desc", "sellers-desc"] as const;

/** How many cards the model sees and the UI shows. One number, on purpose. */
export const SHOWN = 6;

/** Facet entries per group in the trimmed result. */
const FACET_LIMIT = 6;

// ------------------------------------------------------------------- schema
//
// Strings rather than z.enum() so a near-miss ("sensors", "arduino") is
// normalised by validate() instead of failing the whole call and costing the
// model a retry step. The allowed values are in the descriptions.

export const searchCatalogInput = z.object({
  q: z
    .string()
    .optional()
    .describe(
      'One keyword matched as a substring of product name, brand or category, e.g. "ultrasonic", "L298N", "servo". Use the single most specific word; do not pass a sentence.'
    ),
  category: z.string().optional().describe(`One of: ${CATEGORIES.join(", ")}.`),
  platform: z
    .array(z.string())
    .optional()
    .describe(`Boards the product must support. Any of: ${PLATFORMS.join(", ")}.`),
  skill: z.string().optional().describe(`One of: ${SKILLS.join(", ")}.`),
  minPrice: z.number().optional().describe("Lowest price in Pakistani rupees."),
  maxPrice: z
    .number()
    .optional()
    .describe("Highest price in Pakistani rupees. Omit entirely when the user gave no budget."),
  inStock: z.boolean().optional().describe("true to exclude out-of-stock listings."),
  sort: z
    .string()
    .optional()
    .describe(
      `One of: ${SORTS.join(", ")}. Use price-asc for "cheapest", sellers-desc for "most widely sold".`
    ),
});

export type SearchCatalogInput = z.infer<typeof searchCatalogInput>;

export interface AppliedFilters {
  q?: string;
  category?: string;
  platform?: string[];
  skill?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: string;
}

// ----------------------------------------------------------------- validate

function matchOne(value: string | undefined, allowed: readonly string[]): string | undefined {
  if (!value) return undefined;
  const wanted = value.trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === wanted);
}

/**
 * Turns whatever the model sent into filters the catalogue accepts. Unknown
 * values are dropped and named in `dropped` (for the log), never sent on.
 */
export function validate(input: SearchCatalogInput): { applied: AppliedFilters; dropped: string[] } {
  const applied: AppliedFilters = {};
  const dropped: string[] = [];

  const q = input.q?.trim().toLowerCase();
  if (q) applied.q = q;

  if (input.category !== undefined) {
    const category = matchOne(input.category, CATEGORIES);
    if (category) applied.category = category;
    else dropped.push(`category: ${input.category}`);
  }

  if (input.platform && input.platform.length > 0) {
    const platforms: string[] = [];
    for (const raw of input.platform) {
      const platform = matchOne(raw, PLATFORMS);
      if (platform) platforms.push(platform);
      else dropped.push(`platform: ${raw}`);
    }
    if (platforms.length > 0) applied.platform = platforms;
  }

  if (input.skill !== undefined) {
    const skill = matchOne(input.skill, SKILLS);
    if (skill) applied.skill = skill;
    else dropped.push(`skill: ${input.skill}`);
  }

  // Models fill optional numbers with 0 when the user named no budget; a
  // maxPrice of 0 would silently match nothing.
  let min = typeof input.minPrice === "number" && input.minPrice > 0 ? input.minPrice : undefined;
  let max = typeof input.maxPrice === "number" && input.maxPrice > 0 ? input.maxPrice : undefined;
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  if (min !== undefined) applied.minPrice = min;
  if (max !== undefined) applied.maxPrice = max;

  if (input.inStock === true) applied.inStock = true;

  if (input.sort !== undefined) {
    const sort = matchOne(input.sort, SORTS);
    if (sort && sort !== "featured") applied.sort = sort;
    else if (!sort) dropped.push(`sort: ${input.sort}`);
  }

  return { applied, dropped };
}

// --------------------------------------------------------------- the fetch

/** The query string GET /catalog expects; multi-select params repeat. */
export function buildQuery(f: AppliedFilters): string {
  const params = new URLSearchParams();
  if (f.q) params.append("q", f.q);
  if (f.category) params.append("category", f.category);
  for (const p of f.platform ?? []) params.append("platform", p);
  if (f.skill) params.append("skill", f.skill);
  if (f.minPrice !== undefined) params.append("minPrice", String(f.minPrice));
  if (f.maxPrice !== undefined) params.append("maxPrice", String(f.maxPrice));
  if (f.inStock) params.append("inStock", "true");
  if (f.sort) params.append("sort", f.sort);
  return params.toString();
}

/**
 * GET /catalog returns more per product than types/catalog.ts declares — the
 * chat card needs these extra fields, so they are named here and nowhere else.
 */
export type CatalogRobot = CatalogProduct & {
  languages?: string[];
  os?: string[];
  ros?: string | null;
  sellers?: RobotSeller[];
  ageMin?: number;
  ageMax?: number;
  dof?: number;
};

export interface SearchDeps {
  fetch: typeof fetch;
  baseUrl: string;
}

async function fetchCatalog(filters: AppliedFilters, deps: SearchDeps): Promise<CatalogResponse> {
  const query = buildQuery(filters);
  const url = `${deps.baseUrl}/catalog${query ? `?${query}` : ""}`;
  const res = await deps.fetch(url);
  if (!res.ok) throw new Error(`GET /catalog ${res.status}`);
  return (await res.json()) as CatalogResponse;
}

// -------------------------------------------------------------- formatting

/** Prices show in the currency the seller quoted — never converted. */
export function formatPrice(value: number, currency: string): string {
  const rounded = Math.round(value);
  if (currency === "USD") return `$${rounded.toLocaleString("en-US")}`;
  return `Rs ${rounded.toLocaleString("en-PK")}`;
}

/** The card ChatMessage's product_row renders (types/index.ts RobotCard). */
export function toRobotCard(p: CatalogRobot): RobotCard {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    image: p.image,
    price: p.price,
    priceLabel: formatPrice(p.price, p.currency),
    offerCount: p.offerCount,
    verified: p.hasVerifiedSeller,
    ageMin: p.ageMin,
    ageMax: p.ageMax,
    skill: p.skill,
    platforms: p.platforms,
    languages: p.languages ?? [],
    os: p.os ?? [],
    ros: p.ros ?? null,
    dof: p.dof,
    tutorials: p.tutorials,
    sellers: p.sellers ?? [],
  };
}

// --------------------------------------------------------------------- trim

export interface TrimmedCard {
  id: string;
  name: string;
  brand: string;
  price: string;
  pricePkr: number;
  platforms: string[];
  skill: string;
  sellers: number;
  inStock: boolean;
}

export type FacetPairs = [string, number][];

export interface ModelResult {
  total: number;
  shown: number;
  applied: AppliedFilters;
  top: TrimmedCard[];
  /** Present only when total > shown: the levers for narrowing. */
  facets?: { category: FacetPairs; platform: FacetPairs; price: FacetPairs };
  /** Present only when total === 0 and q was set: how many the other filters alone match. */
  withoutKeyword?: number;
}

export interface ModelError {
  error: string;
}

function pairs(options: FacetOption[]): FacetPairs {
  return options.slice(0, FACET_LIMIT).map((o) => [o.value, o.count]);
}

/** What the model sees. Roughly 35 tokens a card, so ~300–600 tokens in all. */
export function trim(res: CatalogResponse, applied: AppliedFilters): ModelResult {
  const top = res.products.slice(0, SHOWN).map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    price: formatPrice(p.price, p.currency),
    pricePkr: p.pricePkr,
    platforms: p.platforms,
    skill: p.skill,
    sellers: p.offerCount,
    inStock: p.inStock,
  }));

  const result: ModelResult = { total: res.total, shown: top.length, applied, top };

  if (res.total > top.length) {
    result.facets = {
      category: pairs(res.facets.category),
      platform: pairs(res.facets.platform),
      price: pairs(res.facets.price),
    };
  }

  return result;
}

// ------------------------------------------------------------------- run

export interface SearchOutcome {
  result: ModelResult | ModelError;
  /** Full cards for the SSE `products` event; empty on error. */
  cards: RobotCard[];
  dropped: string[];
}

export async function runSearch(input: SearchCatalogInput, deps: SearchDeps): Promise<SearchOutcome> {
  const { applied, dropped } = validate(input);
  try {
    const res = await fetchCatalog(applied, deps);
    const result = trim(res, applied);
    if (res.total === 0 && applied.q) {
      const { q: _q, ...withoutQ } = applied;
      const again = await fetchCatalog(withoutQ, deps);
      result.withoutKeyword = again.total;
    }
    return { result, cards: res.products.slice(0, SHOWN).map((p) => toRobotCard(p as CatalogRobot)), dropped };
  } catch {
    return {
      result: { error: "The catalogue service is unreachable. Tell the user to try again in a moment." },
      cards: [],
      dropped,
    };
  }
}

// ------------------------------------------------------------------- tool

/** What one turn remembers about its searches, for the SSE events after the text. */
export interface LastSearch {
  cards: RobotCard[];
  applied: AppliedFilters;
}

export interface TurnState {
  lastSearch: LastSearch | null;
}

export function makeSearchCatalogTool(turn: TurnState, deps: SearchDeps) {
  return tool({
    description:
      "Search the robotics parts catalogue with structured filters. Returns the total match count, up to six matching products, and — when there are more — facet counts you can use to narrow. Always call this before recommending, pricing or comparing any product; never name a product it did not return.",
    inputSchema: searchCatalogInput,
    execute: async (input) => {
      const outcome = await runSearch(input, deps);
      if (outcome.dropped.length > 0) console.warn(`[search_catalog] dropped ${outcome.dropped.join("; ")}`);
      if ("total" in outcome.result) {
        turn.lastSearch = { cards: outcome.cards, applied: outcome.result.applied };
      }
      return outcome.result;
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/agent/tools/searchCatalog.test.ts`
Expected: 17 passed. If `toLocaleString("en-PK")` renders `350` without grouping on your Node, the test values under 1,000 are unaffected; if a grouping test is added later it needs full ICU, which Node 22 ships.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. The unused `_q` destructure is intentional; if eslint flags it, rename to `q: _unused` is not enough for `@typescript-eslint/no-unused-vars` under `eslint-config-next` — instead replace the two lines with:
```ts
      const withoutQ: AppliedFilters = { ...applied };
      delete withoutQ.q;
```

- [ ] **Step 6: Commit**

```bash
git add ui/src/agent/tools/searchCatalog.ts ui/src/agent/tools/searchCatalog.test.ts
git commit -m "Add the search_catalog tool over GET /catalog"
```

---

### Task 6: The `find_video_tutorials` tool

**Files:**
- Create: `ui/src/agent/tools/findVideoTutorials.ts`
- Test: `ui/src/agent/tools/findVideoTutorials.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `ui/src/agent/tools/findVideoTutorials.test.ts`:
```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFileCache,
  parseSerpResults,
  searchVideos,
  TTL_MS,
  type Video,
  type VideoCache,
} from "./findVideoTutorials";

const serpBody = {
  video_results: [
    { title: "HC-SR04 with Arduino", link: "https://youtube.com/watch?v=1", channel: { name: "Maker A" }, length: "5:12" },
    { title: "Ultrasonic basics", link: "https://youtube.com/watch?v=2", channel: { name: "Maker B" }, length: "12:01" },
    { title: "3", link: "https://youtube.com/watch?v=3", channel: { name: "C" }, length: "1:00" },
    { title: "4", link: "https://youtube.com/watch?v=4", channel: { name: "D" }, length: "1:00" },
    { title: "5", link: "https://youtube.com/watch?v=5", channel: { name: "E" }, length: "1:00" },
    { title: "6", link: "https://youtube.com/watch?v=6", channel: { name: "F" }, length: "1:00" },
  ],
};

describe("parseSerpResults", () => {
  it("keeps five results with the four fields the model needs", () => {
    const videos = parseSerpResults(serpBody);
    expect(videos).toHaveLength(5);
    expect(videos[0]).toEqual({ title: "HC-SR04 with Arduino", channel: "Maker A", url: "https://youtube.com/watch?v=1", duration: "5:12" });
  });

  it("tolerates missing channel or length", () => {
    const videos = parseSerpResults({ video_results: [{ title: "x", link: "https://y" }] });
    expect(videos).toEqual([{ title: "x", channel: "", url: "https://y", duration: "" }]);
  });

  it("returns an empty list for a body with no video_results", () => {
    expect(parseSerpResults({})).toEqual([]);
  });
});

describe("createFileCache", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "yt-cache-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("misses on an unknown key and hits after set, persisting to disk", () => {
    const file = join(dir, "youtube.json");
    let now = 1_000;
    const cache = createFileCache(file, () => now);
    expect(cache.get("hc-sr04")).toBeUndefined();
    cache.set("hc-sr04", [{ title: "t", channel: "c", url: "u", duration: "d" }]);
    expect(cache.get("hc-sr04")).toHaveLength(1);
    expect(JSON.parse(readFileSync(file, "utf8"))["hc-sr04"].at).toBe(1_000);

    // A fresh instance reads what the first one wrote.
    const reopened = createFileCache(file, () => now);
    expect(reopened.get("hc-sr04")).toHaveLength(1);

    now = 1_000 + TTL_MS + 1;
    expect(reopened.get("hc-sr04")).toBeUndefined();
  });

  it("survives a missing or corrupt file", () => {
    const file = join(dir, "missing", "youtube.json");
    const cache = createFileCache(file, () => 0);
    expect(cache.get("x")).toBeUndefined();
    cache.set("x", []);
    expect(cache.get("x")).toEqual([]);
  });
});

describe("searchVideos", () => {
  it("calls SerpAPI once per query and serves the second call from cache", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(serpBody));
    }) as unknown as typeof fetch;
    const store = new Map<string, Video[]>();
    const cache: VideoCache = {
      get: (k) => store.get(k),
      set: (k, v) => void store.set(k, v),
    };

    const first = await searchVideos("HC-SR04 Arduino", { fetch: fetchImpl, key: "k", cache });
    const second = await searchVideos("  hc-sr04 arduino ", { fetch: fetchImpl, key: "k", cache });
    expect(first).toHaveLength(5);
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("https://serpapi.com/search.json?engine=youtube&search_query=hc-sr04+arduino&api_key=k");
  });

  it("returns an error object, not an exception, when SerpAPI fails", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const cache: VideoCache = { get: () => undefined, set: () => undefined };
    const result = await searchVideos("x", { fetch: fetchImpl, key: "k", cache });
    expect(result).toEqual({ error: "Video search is unavailable right now." });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/agent/tools/findVideoTutorials.test.ts`
Expected: FAIL — cannot find module `./findVideoTutorials`.

- [ ] **Step 3: Write `findVideoTutorials.ts`**

Create `ui/src/agent/tools/findVideoTutorials.ts`:
```ts
/**
 * `find_video_tutorials` — YouTube results for "how do I use X".
 *
 * Proposal objective 7 names video tutorials as the gap no Pakistani robotics
 * store fills. This tool does not host or curate anything: it runs a YouTube
 * search through SerpAPI and hands the model five titles with links. The
 * model presents them; the user watches them on YouTube.
 *
 * Results are cached on disk because SerpAPI bills per search, not because of
 * tokens (five results are ~250 tokens). YouTube Data API v3 returns the same
 * fields free within its quota; only fetchSerp() would change.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tool } from "ai";
import { z } from "zod";

export interface Video {
  title: string;
  channel: string;
  url: string;
  duration: string;
}

export interface VideoCache {
  get(key: string): Video[] | undefined;
  set(key: string, videos: Video[]): void;
}

export const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESULT_LIMIT = 5;

// -------------------------------------------------------------------- cache

type CacheFile = Record<string, { at: number; videos: Video[] }>;

/** Loaded once, written through on every set. A bad file is an empty cache. */
export function createFileCache(path: string, now: () => number = Date.now): VideoCache {
  let entries: CacheFile;
  try {
    entries = JSON.parse(readFileSync(path, "utf8")) as CacheFile;
  } catch {
    entries = {};
  }
  return {
    get(key) {
      const hit = entries[key];
      if (!hit) return undefined;
      if (now() - hit.at > TTL_MS) {
        delete entries[key];
        return undefined;
      }
      return hit.videos;
    },
    set(key, videos) {
      entries[key] = { at: now(), videos };
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(entries));
      } catch (err) {
        console.warn(`[find_video_tutorials] cache not written: ${String(err)}`);
      }
    },
  };
}

// ------------------------------------------------------------------ SerpAPI

interface SerpVideo {
  title?: string;
  link?: string;
  channel?: { name?: string };
  length?: string;
}

export function parseSerpResults(body: { video_results?: SerpVideo[] }): Video[] {
  return (body.video_results ?? []).slice(0, RESULT_LIMIT).map((v) => ({
    title: v.title ?? "",
    channel: v.channel?.name ?? "",
    url: v.link ?? "",
    duration: v.length ?? "",
  }));
}

export interface VideoDeps {
  fetch: typeof fetch;
  key: string;
  cache: VideoCache;
}

export interface VideoError {
  error: string;
}

export async function searchVideos(query: string, deps: VideoDeps): Promise<Video[] | VideoError> {
  const key = query.trim().toLowerCase().replace(/\s+/g, " ");
  const cached = deps.cache.get(key);
  if (cached) {
    console.log(`[find_video_tutorials] cache hit "${key}"`);
    return cached;
  }

  const params = new URLSearchParams({ engine: "youtube", search_query: key, api_key: deps.key });
  try {
    const res = await deps.fetch(`https://serpapi.com/search.json?${params.toString()}`);
    if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
    const videos = parseSerpResults((await res.json()) as { video_results?: SerpVideo[] });
    deps.cache.set(key, videos);
    return videos;
  } catch (err) {
    console.warn(`[find_video_tutorials] ${String(err)}`);
    return { error: "Video search is unavailable right now." };
  }
}

// --------------------------------------------------------------------- tool

export function makeFindVideoTutorialsTool(deps: VideoDeps) {
  return tool({
    description:
      "Find up to five YouTube video tutorials for a part, board or technique. Call it only when the user asks how to use, wire, program or learn something. Present the results as markdown links with the channel name.",
    inputSchema: z.object({
      query: z
        .string()
        .describe('A short YouTube search, naming the part and the board, e.g. "HC-SR04 Arduino" or "L298N motor driver ESP32".'),
    }),
    execute: async ({ query }) => searchVideos(query, deps),
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/agent/tools/findVideoTutorials.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add ui/src/agent/tools/findVideoTutorials.ts ui/src/agent/tools/findVideoTutorials.test.ts
git commit -m "Add the find_video_tutorials tool with a SerpAPI cache"
```

---

### Task 7: Tool registry and system prompt

**Files:**
- Create: `ui/src/agent/tools/index.ts`
- Create: `ui/src/agent/prompt.ts`
- Test: `ui/src/agent/prompt.test.ts`

- [ ] **Step 1: Write the failing prompt test**

Create `ui/src/agent/prompt.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { systemPrompt } from "./prompt";

describe("systemPrompt", () => {
  it("is byte-stable across calls so provider prefix caching can apply", () => {
    expect(systemPrompt(true)).toBe(systemPrompt(true));
  });

  it("carries the grounding rule and the ROS honesty line", () => {
    const text = systemPrompt(true);
    expect(text).toContain("Only name products that search_catalog returned");
    expect(text).toContain("limited set of stores");
  });

  it("includes the topic rule only when guardrails are on", () => {
    expect(systemPrompt(true)).toContain("Stay on robotics");
    expect(systemPrompt(false)).not.toContain("Stay on robotics");
  });

  it("stays small — under ~600 tokens", () => {
    expect(systemPrompt(true).length).toBeLessThan(2600);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/agent/prompt.test.ts`
Expected: FAIL — cannot find module `./prompt`.

- [ ] **Step 3: Write `prompt.ts`**

Create `ui/src/agent/prompt.ts`:
```ts
/**
 * The assistant's system prompt. Static and byte-stable on purpose: both
 * providers cache a repeated prefix when they can, and any change here
 * invalidates it. Per-turn facts go in the messages, never here.
 */

const BASE = `You are Robot Advisor, the assistant for Servo, a catalogue that aggregates robotics parts, modules and kits from Pakistani stores such as Robo.pk. Prices are quoted in the seller's currency, mostly rupees.

Grounding
- Only name products that search_catalog returned in this turn. Never state a spec, price or seller the tool did not give you. Quote prices exactly as the tool formats them.
- The catalogue is components and kits, not full ROS robots. If search_catalog returns nothing for a ROS or robot-platform request, say so: the crawl covers a limited set of stores whose range is parts and modules, and offer to suggest parts for what the user is building.

When to search
- Call search_catalog for any product, part, price, budget or recommendation request. Map the request onto its filters: a part type is usually a category or a q keyword, a board name is a platform, a budget is maxPrice in rupees.
- Do not search for greetings, for jargon questions ("what does I2C mean" — explain from your own knowledge in at most three sentences), or for follow-ups about products already shown this turn.
- If the result has more matches than it shows, either search once more with a sort (price-asc for cheapest) or ask one narrowing question using the facets. Never search more than twice in a turn.
- If the result has zero matches, use withoutKeyword to say what the other filters would find, and suggest one change.

Tutorials
- Call find_video_tutorials only when the user asks how to use, wire, program or learn something. Present results as markdown links with the channel name.

Style
- At most 120 words. Short paragraphs or markdown bullet lists; no tables. Mention at most three products by name and say in one clause why each fits. Do not repeat the cards' details back — the user can see them.`;

const TOPIC_RULE = `
- Stay on robotics, electronics and this catalogue. For anything else, decline in one sentence and offer to help find a part.`;

export function systemPrompt(guardrails: boolean): string {
  return guardrails ? BASE + "\n" + TOPIC_RULE : BASE;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/agent/prompt.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Write the tool registry**

Create `ui/src/agent/tools/index.ts`:
```ts
/**
 * The tools one turn gets. `turn` is where search_catalog leaves the cards for
 * the SSE `products` event; the route reads it after the text has streamed.
 * find_video_tutorials is registered only when a SerpAPI key exists, so the
 * model never offers videos it cannot fetch.
 */

import { join } from "node:path";
import { createFileCache, makeFindVideoTutorialsTool, type VideoCache } from "./findVideoTutorials";
import { makeSearchCatalogTool, type TurnState } from "./searchCatalog";

export type { TurnState } from "./searchCatalog";

const CATALOG_API_URL = process.env.CATALOG_API_URL || "http://localhost:8009";

let videoCache: VideoCache | null = null;

function cache(): VideoCache {
  if (!videoCache) videoCache = createFileCache(join(process.cwd(), ".cache", "youtube.json"));
  return videoCache;
}

export function makeTools(turn: TurnState) {
  const tools = {
    search_catalog: makeSearchCatalogTool(turn, { fetch, baseUrl: CATALOG_API_URL }),
  } as Record<string, ReturnType<typeof makeSearchCatalogTool> | ReturnType<typeof makeFindVideoTutorialsTool>>;

  const key = process.env.SERPAPI_KEY;
  if (key) tools.find_video_tutorials = makeFindVideoTutorialsTool({ fetch, key, cache: cache() });

  return tools;
}
```

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If the `tools` cast is rejected by `streamText` in Task 8, replace the body with two explicit shapes:
```ts
  const search = makeSearchCatalogTool(turn, { fetch, baseUrl: CATALOG_API_URL });
  const key = process.env.SERPAPI_KEY;
  if (!key) return { search_catalog: search };
  return { search_catalog: search, find_video_tutorials: makeFindVideoTutorialsTool({ fetch, key, cache: cache() }) };
```

- [ ] **Step 7: Commit**

```bash
git add ui/src/agent/prompt.ts ui/src/agent/prompt.test.ts ui/src/agent/tools/index.ts
git commit -m "Add the assistant's system prompt and tool registry"
```

---

### Task 8: The route handler

**Files:**
- Create: `ui/src/app/api/query/stream/route.ts`

No unit test: this is the composition of everything above and is exercised by the manual script in Task 10.

- [ ] **Step 1: Write the route**

Create `ui/src/app/api/query/stream/route.ts`:
```ts
/**
 * POST /api/query/stream — the assistant.
 *
 * Same request body and the same SSE frames the mock server's regex assistant
 * used, so the Chatbox is unchanged. One streamText call with two tools and a
 * step cap of three (search → optional refinement → answer). Providers are
 * tried in LLM_PROVIDER order; a failure before the first token moves on, a
 * failure after it ends the turn with an apology. Text streams as `content`;
 * the cards from the last search follow as `products` and `filters`; then
 * `[DONE]`. Design: docs/superpowers/specs/2026-09-19-llm-assistant-design.md
 */

import { isStepCount, streamText, type ModelMessage } from "ai";
import { history, remember } from "../../../../agent/memory";
import { modelFor, parseProviderList, withFailover } from "../../../../agent/provider";
import { systemPrompt } from "../../../../agent/prompt";
import { DONE, FIXED_REPLIES, SSE_HEADERS, encodeEvent, fixedReply } from "../../../../agent/sse";
import { makeTools, type TurnState } from "../../../../agent/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STEPS = 3;

interface Body {
  user_id?: string | number;
  query?: string;
  guardrails?: boolean;
  image?: string;
  image_bool?: boolean;
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as Body;
  const userId = String(body.user_id ?? "anonymous");
  const query = String(body.query ?? "").trim();
  const guardrails = body.guardrails !== false;

  if (body.image_bool && body.image) return fixedReply(FIXED_REPLIES.image);
  if (!query) return fixedReply("Ask me about a part, a board or a budget and I'll search the catalogue.");

  const providers = parseProviderList(process.env.LLM_PROVIDER);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: string) => controller.enqueue(encoder.encode(frame));
      const startedAt = Date.now();
      const turn: TurnState = { lastSearch: null };
      const messages: ModelMessage[] = [...history(userId), { role: "user", content: query }];
      let answer = "";
      let interrupted = false;

      const used = await withFailover(providers, async (name) => {
        answer = "";
        turn.lastSearch = null;
        const attemptStart = Date.now();

        const result = streamText({
          model: modelFor(name),
          instructions: systemPrompt(guardrails),
          messages,
          tools: makeTools(turn),
          stopWhen: isStepCount(MAX_STEPS),
        });

        try {
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              answer += part.text;
              send(encodeEvent({ type: "content", payload: part.text }));
            } else if (part.type === "error") {
              throw part.error;
            }
          }
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode;
          console.warn(`[assistant] provider=${name} failed after ${answer.length} chars status=${status ?? "n/a"}: ${String(err)}`);
          if (answer.length === 0) return "failed-before-output";
          interrupted = true;
          send(encodeEvent({ type: "content", payload: FIXED_REPLIES.interrupted }));
          return "completed";
        }

        const [usage, steps] = await Promise.all([result.totalUsage, result.steps]);
        console.log(
          `[assistant] user=${userId} provider=${name} steps=${steps.length} ` +
            `in=${usage.inputTokens ?? "?"} out=${usage.outputTokens ?? "?"} ` +
            `ms=${Date.now() - attemptStart} total_ms=${Date.now() - startedAt} query=${JSON.stringify(query)}`
        );
        return "completed";
      });

      if (used === null) {
        send(encodeEvent({ type: "content", payload: FIXED_REPLIES.unavailable }));
      } else {
        if (turn.lastSearch && turn.lastSearch.cards.length > 0) {
          send(encodeEvent({ type: "products", payload: turn.lastSearch.cards }));
          send(encodeEvent({ type: "filters", payload: turn.lastSearch.applied }));
        }
        if (answer && !interrupted) remember(userId, query, answer);
      }

      send(DONE);
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
```

- [ ] **Step 2: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean. Likely fixes if not:
- `part.type === "error"` not in the union → check `node_modules/ai/dist/index.d.ts` for `TextStreamPart` and use the error part's actual type name.
- `result.totalUsage` / `result.steps` not promises → drop the `Promise.all` and read them directly.
- `instructions` rejected → the installed `ai` is older than 7; run `npm ls ai` and reinstall `ai@^7`.

- [ ] **Step 3: Commit**

```bash
git add ui/src/app/api/query/stream/route.ts
git commit -m "Add the assistant route handler"
```

---

### Task 9: Route the data calls through Next

**Files:**
- Modify: `ui/next.config.ts`

- [ ] **Step 1: Add the rewrites**

Replace `ui/next.config.ts` with:
```ts
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

  async rewrites() {
    return ["catalog", "tutorials", "health"].map((route) => ({
      source: `/api/${route}`,
      destination: `${CATALOG_API_URL}/${route}`,
    }));
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify the rewrites against the running mock server**

With `cd mock-server && node server.js` running in one terminal and `cd ui && npm start` in another:

Run: `curl -s "http://localhost:3000/api/health"`
Expected: `{"status":"ok","robots":2880,"tutorials":87}` (your counts may differ).

Run: `curl -s "http://localhost:3000/api/catalog?category=Sensors&maxPrice=500" | head -c 200`
Expected: JSON beginning `{"total":` — query strings pass through.

- [ ] **Step 3: Browser check**

Open `http://localhost:3000/`, `/catalog?category=Sensors`, `/tutorials`. Each renders products/tutorials with a clean console. The typeahead search in the navbar returns suggestions.

- [ ] **Step 4: Commit**

```bash
git add ui/next.config.ts
git commit -m "Forward the data routes to the mock server from Next"
```

---

### Task 10: Manual script and measured cost

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-llm-assistant-design.md` (the estimate paragraph)

Both servers running, at least one provider key in `ui/.env`, terminal showing `npm start` output for the `[assistant]` log lines.

- [ ] **Step 1: Smoke test the route from the shell**

Run:
```bash
curl -sN -X POST http://localhost:3000/api/query/stream -H "Content-Type: application/json" \
  -d '{"user_id":"t1","query":"ultrasonic sensor under Rs 500","guardrails":true,"image":"","image_bool":false}'
```
Expected: a run of `data: {"type":"content",...}` frames, then one `data: {"type":"products",...}` with ≤6 cards, one `data: {"type":"filters",...}`, then `data: [DONE]`. The Next terminal logs one `[assistant] user=t1 provider=gemini steps=2 in=… out=…` line.

- [ ] **Step 2: Run the eight queries in the Chatbox**

On `http://localhost:3000/assistant`, one at a time, and record the `in=` / `out=` numbers from the log:

| Query | Expect |
|---|---|
| hi | no cards, greeting, `steps=1` |
| ultrasonic sensor under Rs 500 | ≤6 cards, `filters` in the network tab |
| sensors for Arduino | either a narrowing question or a sorted six; `steps` ≤ 3 |
| which of those is cheapest | no new cards; names one from the previous set |
| what does I2C mean | no cards; ≤3 sentences |
| how do I use the HC-SR04 | five links (needs `SERPAPI_KEY`); repeat it — log shows `cache hit` |
| robots with ROS 2 | no cards; the "limited set of stores" line |
| write me a poem | one-line decline |

Then set `GOOGLE_GENERATIVE_AI_API_KEY=bad` in `.env`, restart `npm start`, ask anything: the log shows `provider=gemini failed after 0 chars` then `provider=openai`. Set both keys bad: the reply is the fixed unavailable line and the Chatbox re-enables its input.

- [ ] **Step 3: Anything wrong is a test first**

If a query misbehaves in a way a pure function owns (a dropped filter, a bad card field, a cache miss), add the case to the matching `*.test.ts`, watch it fail, fix, commit. If it is prompt behaviour, adjust `prompt.ts` and re-run the affected queries.

- [ ] **Step 4: Record the numbers in the spec**

In the spec, replace the paragraph beginning "Estimated cost per turn" with the measured figures, for example:
```markdown
Measured cost per turn on 2026-09-19 (gemini-2.5-flash): greeting 1,1xx in / xx out;
one search 2,xxx in / 1xx out; search + refinement 3,xxx in / 1xx out.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-19-llm-assistant-design.md
git commit -m "Record the assistant's measured token cost"
```

---

### Task 11: Delete the regex assistant from the mock server

**Files:**
- Modify: `mock-server/server.js`

The mock server keeps `GET /catalog`, `GET /tutorials`, `GET /health`, `loadRobots`, `loadTutorials`, `buildCatalog` and its helpers, CORS, and the `/api` prefix strip. Everything that existed only to answer chat goes.

- [ ] **Step 1: Remove the search section**

Delete from the line `// ---------------------------------------------------------------- search` (line 183) through the end of `applyFilters()` (the line before `// ------------------------------------------------------- catalogue browsing`, line 300). That removes `STOP_WORDS`, `tokenize`, `variantsOf`, `matches`, `SYNONYMS`, `parseFilters`, `applyFilters`.

- [ ] **Step 2: Remove `searchRobots`, `rank`, the formatting section, and the replies section**

Delete from `function searchRobots(query, limit = 4) {` (line 442) through the end of `buildReply()` (the closing `}` on line 704, just before `// ---------------------------------------------------------------- http`). That removes `searchRobots`, `rank`, `formatPrice`, `formatPkr`, `describe`, `toCard`, the intent regexes, `carts`, `lastShown`, `getCart`, `GLOSSARY`, `buildReply`.

- [ ] **Step 3: Remove `readBody`, `sleep`, `handleStream`, `handleQuery`**

In the http section delete `function readBody(req) {…}`, `const sleep = …`, `async function handleStream(…) {…}` and `async function handleQuery(…) {…}` (lines 714–776).

- [ ] **Step 4: Remove the two POST routes**

In the `http.createServer` callback delete:
```js
    if (req.method === 'POST' && url.startsWith('/query/stream')) {
      await handleStream(req, res, await readBody(req));
      return;
    }

    if (req.method === 'POST' && url.startsWith('/query')) {
      await handleQuery(req, res, await readBody(req));
      return;
    }
```
`CORS_HEADERS` stays (the UI may still be pointed straight at :8009 by an old `.env`); change its `Access-Control-Allow-Methods` to `'GET, OPTIONS'`.

- [ ] **Step 5: Remove `CATEGORIES` if nothing uses it**

Run: `grep -n "CATEGORIES" mock-server/server.js`
If the only remaining hit is its definition (`const CATEGORIES = […]`, line 140), delete that line.

- [ ] **Step 6: Rewrite the header comment**

Replace lines 1–22 with:
```js
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
 *   GET  /health        -> {status:"ok", robots, tutorials}
 *
 * No dependencies: Node's built-in http/fs only.
 */
```

- [ ] **Step 7: Verify nothing dangling**

Run from the repo root:
```bash
node --check mock-server/server.js
grep -nE "buildReply|searchRobots|parseFilters|toCard|formatPrice|handleStream|readBody|GLOSSARY|lastShown|carts" mock-server/server.js
```
Expected: `--check` silent; grep prints nothing.

Restart it: `cd mock-server && node server.js` → `Mock chain server listening on http://localhost:8009`.

Run: `curl -s -X POST http://localhost:8009/query/stream -d '{}'`
Expected: `{"error":"No route for POST /query/stream"}`.

- [ ] **Step 8: Re-run the manual script's first four queries**

On `/assistant`, "hi", "ultrasonic sensor under Rs 500", "which of those is cheapest", "what does I2C mean" all still answer, with cards on the second. `/`, `/catalog?category=Sensors` and `/tutorials` still render.

- [ ] **Step 9: Commit**

```bash
git add mock-server/server.js
git commit -m "Remove the regex assistant from the mock server"
```

---

### Task 12: Docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/PAGES.md`
- Modify: `docs/superpowers/specs/2026-09-19-llm-assistant-design.md` (status line)

- [ ] **Step 1: `CLAUDE.md` — commands**

In the UI commands block, after the `npx tsc --noEmit` line, add:
```bash
npm test                     # vitest: the assistant's pure functions (validate, trim, cache, failover)
```
Replace the paragraph beginning "There are no UI tests." with:
```markdown
UI tests exist only for the assistant's pure functions (`ui/src/agent/**/*.test.ts`,
run with `npm test`); the screens have none. The bar for a UI change is
`npx tsc --noEmit`, a clean `npm run build`, `npm run lint` with no errors, a
clean browser console, and — for anything touching the assistant — the manual
script in the spec. Lint reports ~40 warnings in the upstream NVIDIA chat code
(`any` payloads, setState in fetch effects); those rules are set to `warn` in
`eslint.config.mjs` on purpose — do not add to them, and do not silence them.
```
In the comment at the top of the block, replace `needs Node 20.9+ and ui/.env` with `needs Node 22+ and ui/.env`.

- [ ] **Step 2: `CLAUDE.md` — architecture diagram**

Replace the diagram under "Three independent parts joined by one file on disk" with:
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

- [ ] **Step 3: `CLAUDE.md` — mock server section**

Replace the route table and the two paragraphs after it (`buildReply()` … and `RATE_TO_PKR` …) with:
```markdown
| Route | Purpose |
|---|---|
| `GET /catalog` | Paginated browse plus facet counts; multi-select params repeat. Also the assistant's `search_catalog` tool |
| `GET /tutorials` | `{count, tutorials}` — the whole library, unpaginated. Empty until `run_tutorials.py` has run; a missing `tutorials.json` is a warning, not a fatal error like a missing `robots.json` |
| `GET /health` | `{status, robots, tutorials}` |

The regex assistant that used to live here (`buildReply()`, `POST /query*`) is
gone; the assistant is now the Next.js route handler described under *UI*.

`RATE_TO_PKR` is a hard-coded USD→PKR rate used **only** to put PKR and USD
listings on one axis for filtering and sorting; prices always display in the
currency the seller quoted. Move conversion into the scraper before anyone
treats a converted total as accurate.
```

- [ ] **Step 4: `CLAUDE.md` — UI section: the assistant**

After the route table under *UI*, add a subsection:
```markdown
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
  choose them, so it cannot describe a product that is not on screen.
- **One env var switches providers.** `LLM_PROVIDER=gemini,openai` is tried
  in order; a failure before the first token moves on; when all fail the reply
  is a fixed line and the catalogue keeps working. Keys and model ids are in
  `ui/.env.example`.
- **History is text only and lives in `src/agent/memory.ts`**, an in-memory
  `Map` capped at twelve messages. That is the only file that knows where
  history lives; Supabase replaces it, nothing else changes. It is not
  Vercel-safe as is.
- **`find_video_tutorials` is SerpAPI, cached in `ui/.cache/youtube.json`**
  for seven days because SerpAPI bills per search. Without `SERPAPI_KEY` the
  tool is not registered.
- The data routes reach the mock server through `next.config.ts` rewrites of
  `/api/catalog|tutorials|health` to `CATALOG_API_URL`; `NEXT_PUBLIC_API_BASE_URL`
  is no longer set.
```
In the *Things that are easy to break* list, update the bullet that begins "**Brand name, assistant name, categories, API base URL, and feature flags**" so its last sentence reads: "The API base URL defaults to `/api`; `next.config.ts` forwards the data routes to `CATALOG_API_URL` from `ui/.env` (gitignored; copy `.env.example`)."

- [ ] **Step 5: `CLAUDE.md` — migration path**

Replace the sentence "The migration is to replace the regex rules in `buildReply()` one at a time with model calls, keeping the `/query/stream` SSE contract so `ui/` never changes." with:
```markdown
The first step of that migration is done: the assistant is a model call with
the catalogue as a tool, behind the same `/query/stream` SSE contract, so the
Chatbox never changed. What remains is the data side — PostgreSQL in place of
`robots.json`, and pgvector ranking on top of the SQL filters.
```
Two paragraphs later, replace "The chat ↔ filter wiring named there … is still unbuilt, and both halves are ready for it." with "The chat ↔ filter wiring named there is half built: the assistant emits a `filters` frame; the catalogue does not listen for it yet."

- [ ] **Step 6: `docs/PAGES.md`**

In the section "## Not yet wired: chat ↔ filters", after the paragraph that ends "…and the catalogue announce", add:
```markdown
Update, September 2026: the server half exists. The assistant
(`ui/src/app/api/query/stream/route.ts`) emits a `{type: "filters", payload}`
SSE frame after the cards, carrying the exact `GET /catalog` filters it
applied. `parseFilters()` in `server.js` is gone; the filters now come from
the model, validated in `ui/src/agent/tools/searchCatalog.ts`. What remains is
the catalogue listening: turn that payload into a query string and push it.
```

- [ ] **Step 7: Mark the spec implemented**

In the spec, change the status line to `Date: 2026-09-19. Status: implemented. Branch: \`nextjs-migration\`.`

- [ ] **Step 8: Final checks and commit**

Run from `ui/`: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

```bash
git add CLAUDE.md docs/PAGES.md docs/superpowers/specs/2026-09-19-llm-assistant-design.md
git commit -m "Document the LLM assistant and the removal of the regex one"
```
