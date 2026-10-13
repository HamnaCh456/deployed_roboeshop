/**
 * Fetches a page of the catalogue for the current URL query string.
 *
 * The URL is the single source of truth for filter state: every facet tick
 * rewrites the query string and this hook reacts to it. That makes a filtered
 * view a real link — which is what the navbar category strip needs, and what
 * the assistant will later drive when chat and filters are wired together.
 *
 * Responses go through `fetchCache`, keyed by the full URL, so a page or a
 * filter combination already seen renders from cache on its first frame
 * with no skeleton. Only a query string this tab has never asked for waits.
 */

import { useEffect, useRef, useState } from "react";
import { config } from "../config/config";
import { fetchCache } from "../lib/fetchCache";
import { CatalogResponse } from "../types/catalog";

interface CatalogState {
  data: CatalogResponse | null;
  isLoading: boolean;
  error: string | null;
}

function catalogUrl(search: string): string {
  return `${config.api.baseUrl}/catalog${search}`;
}

export function useCatalog(search: string): CatalogState {
  const [state, setState] = useState<CatalogState>(() => {
    const cached = fetchCache.peek<CatalogResponse>(catalogUrl(search));
    return cached
      ? { data: cached, isLoading: false, error: null }
      : { data: null, isLoading: true, error: null };
  });

  // Filters change fast when someone is ticking boxes; without this an earlier,
  // slower response can land after a later one and show the wrong result set.
  // It also covers unmount: the cleanup bumps the counter, so an answer that
  // arrives afterwards is ignored. The request itself is not cancelled; it
  // belongs to the cache, and its result is still worth keeping.
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const url = catalogUrl(search);

    // A query string already in the cache is answered here, synchronously,
    // so neither the skeleton nor the previous filter's grid shows a frame.
    const cached = fetchCache.peek<CatalogResponse>(url);
    if (cached) {
      setState({ data: cached, isLoading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    fetchCache
      .load<CatalogResponse>(url)
      .then((data) => {
        if (id !== requestId.current) return;
        setState({ data, isLoading: false, error: null });
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setState({
          data: null,
          isLoading: false,
          error:
            "Could not reach the catalogue server. Start it with `node server.js` in mock-server, then reload.",
        });
      });

    return () => {
      requestId.current += 1;
    };
  }, [search]);

  return state;
}
