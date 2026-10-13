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

/** A type alias, not an interface, so it satisfies the SSE `filters` payload. */
export type AppliedFilters = {
  q?: string;
  category?: string;
  platform?: string[];
  skill?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: string;
};

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
      const withoutQ: AppliedFilters = { ...applied };
      delete withoutQ.q;
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
  /** Set by generate_bom after a successful generation, for the SSE bom event. */
  lastBom: import("./generateBom").BomResult | null;
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
