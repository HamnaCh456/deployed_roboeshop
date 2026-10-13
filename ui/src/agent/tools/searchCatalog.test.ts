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
    expect("total" in result && result.total).toBe(1);
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
    expect("total" in result && result.total).toBe(0);
    expect("withoutKeyword" in result && result.withoutKeyword).toBe(48);
  });

  it("does not re-run when there was no keyword", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(response({ total: 0, products: [] })));
    }) as unknown as typeof fetch;
    const { result } = await runSearch({ category: "Sensors" }, { fetch: fetchImpl, baseUrl: "http://mock" });
    expect(calls).toHaveLength(1);
    expect("withoutKeyword" in result ? result.withoutKeyword : undefined).toBeUndefined();
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
