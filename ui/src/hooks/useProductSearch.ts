/**
 * Typeahead over the catalogue, for tagging a product to a review.
 *
 * Reuses `GET /catalog?q=` rather than adding a search endpoint — the server
 * already scores that query across 2,880 products, and a second implementation
 * would be a second set of rules to keep in step.
 *
 * The response carries a full 48-product page. That is more than a dropdown
 * should ever show, so the slice happens here rather than on the wire: the
 * request is cheap against an in-memory catalogue, and asking for a smaller
 * page would mean a server parameter that exists only for this one caller.
 */

import { useEffect, useRef, useState } from "react";
import { config } from "../config/config";
import { CatalogProduct, CatalogResponse } from "../types/catalog";

/** Long enough that a stray keystroke costs nothing, short enough to feel live. */
const DEBOUNCE_MS = 220;
const MAX_SUGGESTIONS = 7;

interface ProductSearchState {
  results: CatalogProduct[];
  isSearching: boolean;
  /** Set only when the catalogue server cannot be reached. */
  error: string | null;
}

export function useProductSearch(query: string): ProductSearchState {
  const [state, setState] = useState<ProductSearchState>({
    results: [],
    isSearching: false,
    error: null,
  });

  // Typing is faster than the network, so an earlier response can land after a
  // later one. Same guard as useCatalog.
  const requestId = useRef(0);

  const trimmed = query.trim();

  useEffect(() => {
    // Two characters is where the result set stops being "most of the shop".
    if (trimmed.length < 2) {
      requestId.current += 1;
      setState({ results: [], isSearching: false, error: null });
      return;
    }

    const id = ++requestId.current;
    const controller = new AbortController();

    setState((prev) => ({ ...prev, isSearching: true, error: null }));

    const timer = window.setTimeout(() => {
      fetch(
        `${config.api.baseUrl}/catalog?q=${encodeURIComponent(trimmed)}&sort=sellers-desc`,
        { signal: controller.signal }
      )
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        })
        .then((data: CatalogResponse) => {
          if (id !== requestId.current) return;
          setState({
            results: data.products.slice(0, MAX_SUGGESTIONS),
            isSearching: false,
            error: null,
          });
        })
        .catch((err: Error) => {
          if (err.name === "AbortError" || id !== requestId.current) return;
          setState({
            results: [],
            isSearching: false,
            error:
              "Could not reach the catalogue server. Start it with `node server.js` in mock-server, then try again.",
          });
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  return state;
}
