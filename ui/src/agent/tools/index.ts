/**
 * The tools one turn gets. `turn` is where search_catalog leaves the cards for
 * the SSE `products` event; the route reads it after the text has streamed.
 * find_video_tutorials is registered only when a SerpAPI key exists, so the
 * model never offers videos it cannot fetch.
 * generate_bom is always registered; it uses the same catalogue deps as
 * search_catalog and writes its result to turn.lastBom for the SSE bom event.
 */

import { join } from "node:path";
import type { ToolSet } from "ai";
import { createFileCache, makeFindVideoTutorialsTool, type VideoCache } from "./findVideoTutorials";
import { makeSearchCatalogTool, type TurnState } from "./searchCatalog";
import { makeGenerateBomTool } from "./generateBom";

export type { TurnState } from "./searchCatalog";

const CATALOG_API_URL = process.env.CATALOG_API_URL || "http://localhost:8009";

let videoCache: VideoCache | null = null;

function cache(): VideoCache {
  if (!videoCache) videoCache = createFileCache(join(process.cwd(), ".cache", "youtube.json"));
  return videoCache;
}

export function makeTools(turn: TurnState): ToolSet {
  const deps = { fetch, baseUrl: CATALOG_API_URL };
  const search = makeSearchCatalogTool(turn, deps);
  const bom = makeGenerateBomTool(turn, deps);
  const key = process.env.SERPAPI_KEY;
  if (!key) return { search_catalog: search, generate_bom: bom };
  return {
    search_catalog: search,
    generate_bom: bom,
    find_video_tutorials: makeFindVideoTutorialsTool({ fetch, key, cache: cache() }),
  };
}
