/**
 * Local rule-based fallback assistant.
 *
 * Activates when all LLM providers fail — bad keys, no credits, no network.
 * No AI API required. Parses the query with keyword rules, calls GET /catalog
 * with real filters, and streams a grounded text reply over SSE.
 *
 * This is intentionally simple: it is a safety net, not a replacement for the
 * LLM path. It handles the most common query patterns and degrades gracefully
 * for anything it cannot parse.
 */

import type { CatalogResponse } from "../types/catalog";
import type { RobotCard } from "../types";
import { buildQuery, toRobotCard, type CatalogRobot } from "./tools/searchCatalog";

// ---------------------------------------------------------------- types

export interface LocalFilters {
  q?: string;
  category?: string;
  platform?: string;
  maxPrice?: number;
  skill?: string;
  inStock?: boolean;
}

type Intent =
  | { type: "search"; filters: LocalFilters }
  | { type: "bom"; project: string; budget?: number }
  | { type: "glossary"; term: string }
  | { type: "greeting" }
  | { type: "unknown" };

// ---------------------------------------------------------------- glossary

const GLOSSARY: Record<string, string> = {
  ros: "ROS (Robot Operating System) is an open-source framework for writing robot software. It provides libraries and tools to help build robot applications.",
  dof: "DOF (Degrees of Freedom) refers to how many independent directions a robot can move. A 6-DOF arm can move in 6 ways, giving it human-like reach.",
  slam: "SLAM (Simultaneous Localisation and Mapping) lets a robot build a map of its environment while tracking its own position within it.",
  i2c: "I2C is a communication protocol that lets a microcontroller talk to multiple sensors using just 2 wires. Very common on Arduino and Raspberry Pi.",
  pwm: "PWM (Pulse Width Modulation) controls power to motors and LEDs by rapidly switching them on and off. Used to control servo positions and motor speed.",
  servo:
    "A servo motor is a motor with built-in position control. It can be told to rotate to an exact angle, making it ideal for robot joints and steering.",
  lidar:
    "LiDAR uses laser pulses to measure distances and build a 3D map of the surroundings. Used in self-driving robots for obstacle detection.",
  encoder:
    "A motor encoder counts rotations to measure position and speed precisely. Used when a robot needs to know exactly how far it has moved.",
  uart: "UART is a simple serial communication protocol using TX and RX pins. Common for connecting GPS modules, Bluetooth adapters, and displays.",
  spi: "SPI is a fast serial communication protocol using 4 wires. Used for high-speed peripherals like SD cards, display screens, and some sensors.",
};

// ---------------------------------------------------------------- category keywords

const CATEGORY_KEYWORDS: Record<string, string> = {
  sensor: "Sensors",
  sensors: "Sensors",
  motor: "Motors & Actuators",
  servo: "Motors & Actuators",
  actuator: "Motors & Actuators",
  arduino: "Controllers",
  raspberry: "Controllers",
  esp32: "Controllers",
  microcontroller: "Controllers",
  controller: "Controllers",
  battery: "Power",
  power: "Power",
  charger: "Power",
  display: "Display & Audio",
  screen: "Display & Audio",
  lcd: "Display & Audio",
  wheel: "Mechanical",
  chassis: "Mechanical",
  frame: "Mechanical",
  kit: "Robot Kits",
  "starter kit": "Robot Kits",
  tool: "Tools",
  robot: "Robots",
};

// ---------------------------------------------------------------- platform keywords

const PLATFORM_KEYWORDS: Record<string, string> = {
  arduino: "Arduino",
  "raspberry pi": "Raspberry Pi",
  raspberry: "Raspberry Pi",
  esp32: "ESP32",
  stm32: "STM32",
  "micro:bit": "micro:bit",
  microbit: "micro:bit",
};

// ---------------------------------------------------------------- intent detection

export function detectIntent(query: string): Intent {
  const q = query.trim();

  // 1. Greeting
  if (/^(hi|hello|hey|salam|assalam|greetings)/i.test(q)) {
    return { type: "greeting" };
  }

  // 2. Glossary — "what is", "what does", "explain", "define", "mean"
  const isGlossaryQuery =
    /what\s+is\b|what\s+does\b|explain\b|define\b|\bmean\b/i.test(q);
  if (isGlossaryQuery) {
    const lower = q.toLowerCase();
    for (const term of Object.keys(GLOSSARY)) {
      if (lower.includes(term)) {
        return { type: "glossary", term };
      }
    }
  }

  // 3. BOM — "build", "make", "project", "want to build", "parts for", "what do i need"
  const bomMatch = /\b(build|make|project|want\s+to\s+build|parts\s+for|what\s+do\s+i\s+need)\b/i.exec(q);
  if (bomMatch) {
    // Extract project name: text after the matched phrase
    const afterPhrase = q.slice(bomMatch.index + bomMatch[0].length).trim();
    // Remove leading prepositions/articles
    const project = afterPhrase
      .replace(/^(a|an|the|for|to)\s+/i, "")
      .replace(/[?.!,]+$/, "")
      .trim() || q;

    // Parse budget
    const budgetMatch = /(?:under|below|budget|less\s+than)[\s:]*(?:rs\.?\s*)?(\d[\d,]*)/i.exec(q);
    const budget = budgetMatch ? parseInt(budgetMatch[1].replace(/,/g, ""), 10) : undefined;

    return { type: "bom", project, budget };
  }

  // 4. Search — extract filters
  const lower = q.toLowerCase();
  const filters: LocalFilters = {};

  // Category
  // Check multi-word phrases first
  if (lower.includes("starter kit")) {
    filters.category = "Robot Kits";
  } else {
    for (const [kw, cat] of Object.entries(CATEGORY_KEYWORDS)) {
      if (lower.includes(kw)) {
        filters.category = cat;
        break;
      }
    }
  }

  // Platform — check multi-word first
  if (lower.includes("raspberry pi")) {
    filters.platform = "Raspberry Pi";
  } else if (lower.includes("micro:bit") || lower.includes("microbit")) {
    filters.platform = "micro:bit";
  } else {
    for (const [kw, platform] of Object.entries(PLATFORM_KEYWORDS)) {
      if (lower.includes(kw)) {
        filters.platform = platform;
        break;
      }
    }
  }

  // Budget / maxPrice
  const priceMatch = /(?:under|below|less\s+than|budget)[\s:]*(?:rs\.?\s*)?(\d[\d,]*)/i.exec(q);
  if (priceMatch) {
    filters.maxPrice = parseInt(priceMatch[1].replace(/,/g, ""), 10);
  }

  // Skill
  if (/\bbeginner\b/i.test(q)) filters.skill = "Beginner";
  else if (/\bintermediate\b/i.test(q)) filters.skill = "Intermediate";
  else if (/\badvanced\b/i.test(q)) filters.skill = "Advanced";

  // In stock
  if (/\bin[\s-]?stock\b|\bavailable\b/i.test(q)) filters.inStock = true;

  // q keyword: use first meaningful word if no category was found
  if (!filters.category) {
    // Strip stop words and pick the first noun-like word
    const stopWords = new Set([
      "show", "me", "find", "get", "i", "want", "need", "a", "an", "the",
      "for", "with", "some", "any", "all", "please", "can", "you", "list",
      "give", "search", "look", "under", "below", "less", "than", "budget",
      "rs", "in", "stock", "available", "beginner", "intermediate", "advanced",
    ]);
    const words = lower.split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
    if (words.length > 0) filters.q = words[0];
  }

  return { type: "search", filters };
}

// ---------------------------------------------------------------- catalogue fetch

async function fetchProducts(
  filters: LocalFilters,
  baseUrl: string,
  fetchFn: typeof fetch
): Promise<CatalogResponse> {
  // buildQuery accepts AppliedFilters which is compatible with LocalFilters
  const qs = buildQuery(filters as Parameters<typeof buildQuery>[0]);
  const url = `${baseUrl}/catalog${qs ? `?${qs}` : ""}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`GET /catalog ${res.status}`);
  return (await res.json()) as CatalogResponse;
}

// ---------------------------------------------------------------- reply building

export function buildReply(
  intent: Intent,
  result: CatalogResponse | null,
  query: string
): string {
  switch (intent.type) {
    case "greeting":
      return (
        "Hi! I'm Robot Advisor for Servo. I can help you find robotics parts, compare prices across Pakistani stores, or explain technical terms. " +
        'Try asking "Show me Arduino sensors under Rs 2,000" or "What is I2C?"'
      );

    case "glossary":
      return GLOSSARY[intent.term] ?? `Sorry, I don't have a definition for "${intent.term}" yet.`;

    case "bom": {
      const budgetNote = intent.budget
        ? ` Your budget is Rs ${intent.budget.toLocaleString("en-PK")} — I'll focus on affordable options.`
        : "";
      return (
        `I can help you build a ${intent.project}! Let me search for the key parts. ` +
        `Try asking "Show me Arduino controllers" and "Show me motor drivers" to find the components you need.` +
        budgetNote
      );
    }

    case "search": {
      if (!result) {
        return "I couldn't reach the catalogue right now. Please try again in a moment.";
      }

      const { total, products } = result;
      const filters = intent.filters;
      const shown = Math.min(products.length, 6);

      if (total === 0) {
        const categoryNote = filters.category ? ` ${filters.category}` : " parts";
        const filterNote =
          filters.platform || filters.maxPrice || filters.skill
            ? " with those filters"
            : "";
        return `No${categoryNote} found${filterNote}. Try removing some filters or broadening your search.`;
      }

      // Describe applied filters
      const appliedParts: string[] = [];
      if (filters.platform) appliedParts.push(`platform: ${filters.platform}`);
      if (filters.skill) appliedParts.push(`skill: ${filters.skill}`);
      if (filters.maxPrice)
        appliedParts.push(`under Rs ${filters.maxPrice.toLocaleString("en-PK")}`);

      const filterPhrase =
        appliedParts.length > 0 ? `, filtered by ${appliedParts.join(", ")}` : "";

      const categoryLabel = filters.category ?? "parts";

      let reply = `Found ${total} ${categoryLabel} in the catalogue${filterPhrase}. `;

      if (total <= 6) {
        reply += "Here are all the matches";
      } else {
        reply += `Here are the top ${shown} — use the filters on the left to narrow down`;
      }

      // Mention 1–2 product names if available
      if (products.length > 0) {
        const names = products
          .slice(0, 2)
          .map((p) => p.name)
          .join(" and ");
        reply += `, including ${names}`;
      }

      reply += ".";

      if (filters.maxPrice && total > 0) {
        reply += ` All results are within your Rs ${filters.maxPrice.toLocaleString("en-PK")} budget.`;
      }

      return reply;
    }

    case "unknown":
      return (
        "I'm not sure how to help with that. Try asking me to search for a part " +
        '(e.g. "Show me ultrasonic sensors") or explain a term (e.g. "What is ROS?").'
      );
  }
}

// ---------------------------------------------------------------- main export

export interface LocalFallbackDeps {
  fetch: typeof fetch;
  baseUrl: string;
}

export async function runLocalFallback(
  query: string,
  deps: LocalFallbackDeps
): Promise<{ text: string; cards: RobotCard[]; applied: LocalFilters }> {
  const intent = detectIntent(query);

  let result: CatalogResponse | null = null;
  let cards: RobotCard[] = [];
  let applied: LocalFilters = {};

  if (intent.type === "search") {
    applied = intent.filters;
    try {
      result = await fetchProducts(intent.filters, deps.baseUrl, deps.fetch);
      cards = result.products
        .slice(0, 6)
        .map((p) => toRobotCard(p as CatalogRobot));
    } catch {
      // fetchProducts failed — buildReply handles null result gracefully
    }
  }

  const text = buildReply(intent, result, query);
  return { text, cards, applied };
}
