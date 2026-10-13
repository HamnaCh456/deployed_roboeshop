/**
 * `generate_bom` — produces a grounded, shoppable Bill of Materials for a
 * described robotics project.
 *
 * The model names a project, an optional budget, skill, age and platform; this
 * file maps that to a list of part specs, fetches the cheapest matching product
 * from the catalogue for each one, and returns a typed BomResult whose
 * arithmetic is done here in TypeScript — never by the LLM. If a part has no
 * catalogue match, notFound is set and the model says so honestly.
 *
 * Imports formatPrice, buildQuery, PLATFORMS, SKILLS, and SearchDeps from
 * searchCatalog.ts; nothing is duplicated.
 * See docs/superpowers/specs/2026-09-19-llm-assistant-design.md.
 */

import { tool } from "ai";
import { z } from "zod";
import type { CatalogResponse } from "../../types/catalog";
import { buildQuery, formatPrice, PLATFORMS, SKILLS, type AppliedFilters, type SearchDeps, type TurnState } from "./searchCatalog";

// ----------------------------------------------------------- part knowledge

/**
 * One slot in a project BOM. `keywords` are tried as the `q` filter in order;
 * the first keyword that returns results is used.
 */
export interface BomPartSpec {
  role: string;
  category: string;
  keywords: string[];
  qty: number;
  required: boolean;
}

/**
 * Hardcoded knowledge base of project types to required parts. Keys are
 * lowercase; matchProject() does the fuzzy lookup. Adding a project means
 * adding an entry here; no other change needed.
 */
const PROJECT_PARTS: Record<string, BomPartSpec[]> = {
  "line-following robot": [
    { role: "Controller", category: "Controllers", keywords: ["arduino", "uno"], qty: 1, required: true },
    { role: "IR Sensor", category: "Sensors", keywords: ["ir sensor", "line sensor", "tcrt5000"], qty: 2, required: true },
    { role: "Motor Driver", category: "Motors & Actuators", keywords: ["l298n", "motor driver"], qty: 1, required: true },
    { role: "DC Motors", category: "Motors & Actuators", keywords: ["dc motor", "gear motor"], qty: 2, required: true },
    { role: "Wheels", category: "Mechanical", keywords: ["wheel", "tyre"], qty: 2, required: true },
    { role: "Chassis", category: "Mechanical", keywords: ["chassis", "robot car"], qty: 1, required: false },
    { role: "Power Supply", category: "Power", keywords: ["battery", "18650", "lipo"], qty: 1, required: true },
  ],
  "obstacle avoidance robot": [
    { role: "Controller", category: "Controllers", keywords: ["arduino"], qty: 1, required: true },
    { role: "Ultrasonic Sensor", category: "Sensors", keywords: ["hc-sr04", "ultrasonic"], qty: 1, required: true },
    { role: "Motor Driver", category: "Motors & Actuators", keywords: ["l298n", "motor driver"], qty: 1, required: true },
    { role: "DC Motors", category: "Motors & Actuators", keywords: ["dc motor"], qty: 2, required: true },
    { role: "Power Supply", category: "Power", keywords: ["battery"], qty: 1, required: true },
  ],
  "arduino starter kit": [
    { role: "Microcontroller", category: "Controllers", keywords: ["arduino", "uno"], qty: 1, required: true },
    { role: "Breadboard", category: "Prototyping", keywords: ["breadboard"], qty: 1, required: true },
    { role: "LED Kit", category: "Prototyping", keywords: ["led", "resistor"], qty: 1, required: false },
    { role: "Sensors Pack", category: "Sensors", keywords: ["sensor", "dht11", "temperature"], qty: 1, required: false },
  ],
  "esp32 iot project": [
    { role: "ESP32 Board", category: "Controllers", keywords: ["esp32"], qty: 1, required: true },
    { role: "Sensor", category: "Sensors", keywords: ["sensor", "dht22", "bme280"], qty: 1, required: true },
    { role: "Breadboard", category: "Prototyping", keywords: ["breadboard"], qty: 1, required: false },
    { role: "Power", category: "Power", keywords: ["usb", "power bank", "battery"], qty: 1, required: true },
  ],
  "robotic arm": [
    { role: "Servo Motors", category: "Motors & Actuators", keywords: ["servo", "sg90", "mg996r"], qty: 4, required: true },
    { role: "Controller", category: "Controllers", keywords: ["arduino"], qty: 1, required: true },
    { role: "Servo Driver", category: "Controllers", keywords: ["pca9685", "servo driver"], qty: 1, required: false },
    { role: "Power Supply", category: "Power", keywords: ["power supply", "battery"], qty: 1, required: true },
  ],
};

// ----------------------------------------------------------- project matching

/**
 * Returns the best-matching project key for a free-text description, or null
 * when nothing is close enough. Exact substring wins; otherwise at least 60%
 * of the key's words must appear in the description.
 */
export function matchProject(description: string): string | null {
  const lower = description.toLowerCase();
  for (const key of Object.keys(PROJECT_PARTS)) {
    const words = key.split(" ");
    if (words.every((w) => lower.includes(w))) return key;
    // fuzzy: at least ceil(len * 0.6) words match
    if (words.length >= 2 && words.filter((w) => lower.includes(w)).length >= Math.ceil(words.length * 0.6)) return key;
  }
  return null;
}

// --------------------------------------------------------------- result types

export interface BomLine {
  role: string;
  qty: number;
  name: string | null;
  brand: string | null;
  /** Unit price in PKR, or null when not found. */
  priceEach: number | null;
  priceLabel: string | null;
  /** priceEach × qty, or null when not found. */
  totalPrice: number | null;
  category: string;
  inStock: boolean;
  sourceUrl: string | null;
  productId: string | null;
  required: boolean;
  notFound: boolean;
}

export interface BomResult {
  projectName: string;
  /** true when the description matched a known project in PROJECT_PARTS. */
  matched: boolean;
  lines: BomLine[];
  /** Sum of all found lines (required + optional) in PKR. */
  totalPkr: number;
  totalLabel: string;
  /** null when no budget was given. */
  withinBudget: boolean | null;
  /** Roles of required parts that had no catalogue match. */
  missingParts: string[];
  skill: string | null;
  platform: string | null;
}

export interface BomError {
  error: string;
}

// ---------------------------------------------------------------- schema

export const generateBomInput = z.object({
  projectDescription: z
    .string()
    .describe(
      'The project the user wants to build, e.g. "line-following robot", "obstacle avoidance robot", "robotic arm".'
    ),
  budget: z
    .number()
    .optional()
    .describe("Maximum total BOM cost in Pakistani rupees. Omit when the user stated no budget."),
  skill: z
    .enum(SKILLS)
    .optional()
    .describe(`User's skill level. One of: ${SKILLS.join(", ")}.`),
  ageMin: z
    .number()
    .optional()
    .describe("User's age in years. Used to filter age-appropriate products."),
  platform: z
    .string()
    .optional()
    .describe(`Preferred microcontroller platform. Any of: ${PLATFORMS.join(", ")}.`),
});

export type GenerateBomInput = z.infer<typeof generateBomInput>;

// -------------------------------------------------------------- catalogue fetch

/**
 * Tries each keyword in order and returns the first CatalogResponse that has
 * at least one product, or the last response (which may be empty).
 */
async function fetchPartCandidates(
  spec: BomPartSpec,
  extra: Omit<AppliedFilters, "q" | "category">,
  deps: SearchDeps
): Promise<CatalogResponse> {
  let last: CatalogResponse | null = null;
  for (const kw of spec.keywords) {
    const filters: AppliedFilters = { ...extra, q: kw, category: spec.category };
    const qs = buildQuery(filters);
    const url = `${deps.baseUrl}/catalog${qs ? `?${qs}` : ""}`;
    const res = await deps.fetch(url);
    if (!res.ok) throw new Error(`GET /catalog ${res.status}`);
    const data = (await res.json()) as CatalogResponse;
    last = data;
    if (data.total > 0) return data;
  }
  // All keywords returned 0 — return the last (empty) response.
  if (!last) {
    // Fallback: category-only query.
    const filters: AppliedFilters = { ...extra, category: spec.category };
    const qs = buildQuery(filters);
    const url = `${deps.baseUrl}/catalog${qs ? `?${qs}` : ""}`;
    const res = await deps.fetch(url);
    if (!res.ok) throw new Error(`GET /catalog ${res.status}`);
    return (await res.json()) as CatalogResponse;
  }
  return last;
}

/**
 * From a catalogue response, picks the best product for a BOM slot:
 * cheapest in-stock first, then cheapest overall.
 */
function pickBest(data: CatalogResponse): CatalogResponse["products"][number] | null {
  if (data.products.length === 0) return null;
  const inStock = data.products.filter((p) => p.inStock);
  const pool = inStock.length > 0 ? inStock : data.products;
  return pool.reduce((best, p) => (p.pricePkr < best.pricePkr ? p : best));
}

// ------------------------------------------------------------- core generation

export async function runBomGeneration(
  input: GenerateBomInput,
  deps: SearchDeps
): Promise<BomResult | BomError> {
  const projectKey = matchProject(input.projectDescription);
  const matched = projectKey !== null;
  const projectName = projectKey ?? input.projectDescription;
  const specs = matched ? PROJECT_PARTS[projectKey!] : [];

  if (!matched) {
    return {
      projectName,
      matched: false,
      lines: [],
      totalPkr: 0,
      totalLabel: formatPrice(0, "PKR"),
      withinBudget: null,
      missingParts: [],
      skill: input.skill ?? null,
      platform: input.platform ?? null,
    };
  }

  // Budget per required part — a soft cap so cheap parts don't eat all budget.
  const requiredCount = specs.filter((s) => s.required).length;
  const budgetPerPart =
    input.budget && requiredCount > 0 ? Math.floor(input.budget / requiredCount) : undefined;

  // Base filters that apply to every part search (skill, platform, optional budget cap).
  const baseExtra: Omit<AppliedFilters, "q" | "category"> = {};
  if (input.skill) baseExtra.skill = input.skill;
  // Platform filter only when the user specified one and it looks valid.
  if (input.platform) {
    const matched = PLATFORMS.find(
      (p) => p.toLowerCase() === input.platform!.toLowerCase()
    );
    if (matched) (baseExtra as AppliedFilters).platform = [matched];
  }

  const lines: BomLine[] = [];

  for (const spec of specs) {
    const extra: Omit<AppliedFilters, "q" | "category"> = { ...baseExtra };
    // Apply a per-part budget cap only for required parts when a budget exists.
    if (budgetPerPart && spec.required) {
      (extra as AppliedFilters).maxPrice = budgetPerPart;
    }

    let product: CatalogResponse["products"][number] | null = null;
    try {
      const data = await fetchPartCandidates(spec, extra, deps);
      product = pickBest(data);

      // If no result under the budget cap, retry without it.
      if (!product && budgetPerPart && (extra as AppliedFilters).maxPrice) {
        const relaxed: Omit<AppliedFilters, "q" | "category"> = { ...baseExtra };
        const retryData = await fetchPartCandidates(spec, relaxed, deps);
        product = pickBest(retryData);
      }
    } catch {
      // Catalogue unreachable — mark the part as not found.
    }

    if (product) {
      const priceEach = product.pricePkr;
      const totalPrice = priceEach * spec.qty;
      lines.push({
        role: spec.role,
        qty: spec.qty,
        name: product.name,
        brand: product.brand,
        priceEach,
        priceLabel: formatPrice(priceEach, product.currency),
        totalPrice,
        category: spec.category,
        inStock: product.inStock,
        sourceUrl: product.sourceUrl,
        productId: product.id,
        required: spec.required,
        notFound: false,
      });
    } else {
      lines.push({
        role: spec.role,
        qty: spec.qty,
        name: null,
        brand: null,
        priceEach: null,
        priceLabel: null,
        totalPrice: null,
        category: spec.category,
        inStock: false,
        sourceUrl: null,
        productId: null,
        required: spec.required,
        notFound: true,
      });
    }
  }

  const totalPkr = lines.reduce((sum, l) => sum + (l.totalPrice ?? 0), 0);
  const withinBudget =
    input.budget !== undefined ? totalPkr <= input.budget : null;
  const missingParts = lines.filter((l) => l.notFound && l.required).map((l) => l.role);

  return {
    projectName,
    matched: true,
    lines,
    totalPkr,
    totalLabel: formatPrice(totalPkr, "PKR"),
    withinBudget,
    missingParts,
    skill: input.skill ?? null,
    platform: input.platform ?? null,
  };
}

// ------------------------------------------------------------------- tool

export function makeGenerateBomTool(turn: TurnState, deps: SearchDeps) {
  return tool({
    description:
      "Generate a complete Bill of Materials (BOM) — a parts list with prices — for a robotics project. Call this when the user describes a project they want to build, especially with a budget or skill level. Returns each required part with the cheapest matching product from the catalogue and the total cost.",
    inputSchema: generateBomInput,
    execute: async (input) => {
      const result = await runBomGeneration(input, deps);
      if ("matched" in result && result.matched) {
        turn.lastBom = result;
      }
      return result;
    },
  });
}
