/**
 * Fetches the tutorial library from `GET /tutorials`.
 *
 * Unlike `useCatalog`, this takes no query string and fires once. The library
 * is 87 rows, and the page facets, searches and sorts it client-side, so
 * pushing filter state into the URL here would add a round trip per tick
 * without making anything shareable that isn't already.
 *
 * The response goes through `fetchCache`, so the second visit in a session
 * renders the library on its first frame with no loading state.
 *
 * An empty list is a real answer, not a failure: it means `run_tutorials.py`
 * has not been run yet. The page distinguishes that from a dead server.
 */

import { useEffect, useState } from "react";
import { config } from "../config/config";
import { fetchCache } from "../lib/fetchCache";
import { Tutorial } from "../types";

interface TutorialsState {
  tutorials: Tutorial[];
  isLoading: boolean;
  error: string | null;
}

interface TutorialsResponse {
  tutorials: Tutorial[];
  count: number;
}

const URL = `${config.api.baseUrl}/tutorials`;

function fromResponse(data: TutorialsResponse): TutorialsState {
  return {
    tutorials: Array.isArray(data.tutorials) ? data.tutorials : [],
    isLoading: false,
    error: null,
  };
}

export function useTutorials(): TutorialsState {
  const [state, setState] = useState<TutorialsState>(() => {
    const cached = fetchCache.peek<TutorialsResponse>(URL);
    return cached ? fromResponse(cached) : { tutorials: [], isLoading: true, error: null };
  });

  useEffect(() => {
    if (fetchCache.peek(URL) !== undefined) return;

    // The request is not cancelled on unmount; it belongs to the cache and
    // the next visit wants its answer. Only this component stops listening.
    let live = true;

    fetchCache
      .load<TutorialsResponse>(URL)
      .then((data) => {
        if (live) setState(fromResponse(data));
      })
      .catch(() => {
        if (!live) return;
        setState({
          tutorials: [],
          isLoading: false,
          error:
            "Could not reach the tutorial server. Start it with `node server.js` in mock-server, then reload.",
        });
      });

    return () => {
      live = false;
    };
  }, []);

  return state;
}
