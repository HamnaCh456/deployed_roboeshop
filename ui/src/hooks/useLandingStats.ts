/**
 * The figures the landing page prints: how many robots, tutorials and
 * categories the crawl currently holds. Fetched, never typed in, so the page
 * cannot drift from the data behind it.
 *
 * `/health` carries the robot and tutorial counts. The category facet comes
 * from an unfiltered `/catalog` page; both go through `fetchCache`, so a
 * visitor who continues to the catalogue has already paid for that request.
 */

import { useEffect, useState } from "react";
import { config } from "../config/config";
import { fetchCache } from "../lib/fetchCache";
import { CatalogResponse, FacetOption } from "../types/catalog";

interface Health {
  status: string;
  robots: number;
  tutorials: number;
}

export interface LandingStats {
  robots: number | null;
  tutorials: number | null;
  categories: FacetOption[] | null;
  stores: number;
}

const HEALTH_URL = `${config.api.baseUrl}/health`;
const CATALOG_URL = `${config.api.baseUrl}/catalog`;

export function useLandingStats(): LandingStats {
  const [health, setHealth] = useState<Health | null>(
    () => fetchCache.peek<Health>(HEALTH_URL) ?? null,
  );
  const [catalog, setCatalog] = useState<CatalogResponse | null>(
    () => fetchCache.peek<CatalogResponse>(CATALOG_URL) ?? null,
  );

  useEffect(() => {
    let live = true;
    fetchCache
      .load<Health>(HEALTH_URL)
      .then((data) => live && setHealth(data))
      .catch(() => {});
    fetchCache
      .load<CatalogResponse>(CATALOG_URL)
      .then((data) => live && setCatalog(data))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return {
    robots: health?.robots ?? null,
    tutorials: health?.tutorials ?? null,
    categories: catalog?.facets.category ?? null,
    stores: config.ui.stores.length,
  };
}
