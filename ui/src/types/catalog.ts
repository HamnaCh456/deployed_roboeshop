/**
 * Shapes returned by the mock server's GET /catalog.
 *
 * These mirror what `buildCatalog()` in mock-server/server.js emits; the
 * product fields themselves come from `loadRobots()`, which maps the scraper's
 * canonical record in scraper/robotshop/models.py.
 */

export interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string | null;
  summary: string;
  image: string;
  price: number;
  currency: string;
  pricePkr: number;
  offerCount: number;
  hasVerifiedSeller: boolean;
  skill: string;
  platforms: string[];
  inStock: boolean;
  tutorials: number;
  sourceUrl: string;
}

export interface FacetOption {
  value: string;
  /** Only the price bands carry a label; the rest display their raw value. */
  label?: string;
  count: number;
}

export interface CatalogFacets {
  category: FacetOption[];
  platform: FacetOption[];
  skill: FacetOption[];
  price: FacetOption[];
  inStock: number;
  priceRange: { min: number; max: number };
}

export interface CatalogResponse {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sort: string;
  products: CatalogProduct[];
  facets: CatalogFacets;
}

/** The multi-select facet groups, as URL parameter names. */
export type FacetKey = "category" | "platform" | "skill" | "price";

export const FACET_KEYS: FacetKey[] = ["category", "platform", "skill", "price"];
