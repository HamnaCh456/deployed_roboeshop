/**
 * A cache of JSON responses that outlives the page that asked for them.
 *
 * Both data hooks (`useCatalog`, `useTutorials`) used to `fetch` on every
 * mount, so Catalog -> Tutorials -> Catalog showed the skeleton twice for
 * data that cannot have changed: the mock server reads `robots.json` and
 * `tutorials.json` once at boot. This module holds each URL's parsed body
 * for as long as the tab lives. A hook seeds its state from `peek()` so a
 * page already seen renders with its data on the first frame, and calls
 * `load()` otherwise.
 *
 * Nothing expires and nothing is persisted: the data changes only when the
 * scraper reruns and the server restarts, and a hard reload clears the map,
 * so a re-crawl is never hidden behind a stale copy.
 *
 * Failures are not cached. "Start the mock server, then reload" has to keep
 * working, so a dead server must not be remembered as a permanent error.
 *
 * Design record: docs/superpowers/specs/2026-09-19-fetch-cache-skeletons-design.md
 */

interface Entry {
  /** Set once the body has been parsed. */
  value?: unknown;
  /** Set while a request is in flight, so a second caller shares it. */
  pending?: Promise<unknown>;
}

export interface FetchCache {
  /** The cached body for `url`, or undefined. Synchronous, for a useState initialiser. */
  peek<T>(url: string): T | undefined;
  /**
   * The cached body, the in-flight request, or a new fetch, in that order.
   *
   * There is no abort signal on purpose. The request belongs to the cache
   * and every caller shares it, so one caller unmounting must not cancel
   * it for the next: React strict mode mounts, unmounts and remounts every
   * component in development, and the remount would inherit a promise the
   * unmount had just aborted. A hook that no longer wants the answer
   * ignores it instead.
   */
  load<T>(url: string): Promise<T>;
}

export function createFetchCache(fetchImpl: typeof fetch = fetch): FetchCache {
  const entries = new Map<string, Entry>();

  return {
    peek<T>(url: string): T | undefined {
      return entries.get(url)?.value as T | undefined;
    },

    load<T>(url: string): Promise<T> {
      const existing = entries.get(url);
      if (existing?.value !== undefined) return Promise.resolve(existing.value as T);
      if (existing?.pending) return existing.pending as Promise<T>;

      const pending = fetchImpl(url)
        .then((res) => {
          if (!res.ok) throw new Error(`The server answered ${res.status}.`);
          return res.json();
        })
        .then((value: unknown) => {
          entries.set(url, { value });
          return value as T;
        })
        .catch((err: unknown) => {
          // Any rejection drops the entry so the next caller starts fresh.
          entries.delete(url);
          throw err;
        });

      entries.set(url, { pending });
      return pending;
    },
  };
}

/** The one instance the hooks share. Module scope lives as long as the tab. */
export const fetchCache = createFetchCache();
