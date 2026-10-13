# Fetch cache and skeleton loading — design

**Date:** 2026-09-19
**Status:** approved, implemented in the same session
**Supersedes nothing.**

## Why

Every visit to the catalogue or the tutorials page refetches its data and
shows a loading state, including the second, third and tenth visit in the
same session. `useCatalog` and `useTutorials` both start from
`isLoading: true` and `fetch` on mount, and nothing survives a route change.
So Catalog → Tutorials → Catalog shows the skeleton grid twice for data that
has not changed. The data cannot have changed: the mock server reads
`robots.json` and `tutorials.json` once at boot.

Two things fix it. A cache that outlives the page, so a page already seen
renders with its data on the first frame. And a skeleton on the tutorials
page for the one time it does load, in place of a hero with a line of text
where the page used to be.

## Decisions

| Question | Decision |
|---|---|
| Which navigation | Navbar pages. Catalog, Tutorials and back again shows no skeleton the second time. Because the catalogue cache is keyed by the query string, a filter combination already seen also comes back instantly; that falls out of the key, not extra work. |
| Which pages get a skeleton | Catalog (already has one) and Tutorials. Community reads `localStorage`, which is near-instant, so it keeps its one-line state. |
| Where the cache lives | A module-level `Map` in `ui/src/lib/fetchCache.ts`. Module scope lasts as long as the tab, and the App Router never remounts the layout, so it survives every client-side navigation. No SWR or React Query: their revalidate-on-focus defaults are the opposite of "static once loaded", and the repo would gain a dependency for a `Map`. |
| Freshness | Nothing expires. The data changes only when the scraper reruns and the server restarts, and a hard reload clears the map. |
| Persistence | Memory only. `sessionStorage` would fill with one entry per filter combination and would hide a re-crawl behind a stale copy after reload. |
| Failures | A failed request is not cached. "Start the mock server, then reload" has to keep working, and a dead server must not be remembered as a permanent error. |
| In-flight requests | The pending promise is stored, so two callers of the same URL share one `fetch`. |

## The module

```ts
peek<T>(url): T | undefined        // synchronous, for a useState initialiser
load<T>(url, signal?): Promise<T>   // cached value, shared in-flight, or a new fetch
```

`load` throws on a non-2xx response with the same message the hooks used
before, and removes the entry on any rejection. An `AbortSignal` is accepted
so a hook can still cancel on unmount; an abort rejects that caller but does
not evict a fetch another caller is waiting on. (In practice the two hooks
never share a URL, so the entry is simply removed on rejection, which keeps
the module small. If a shared URL ever aborts, the next caller refetches,
which is correct, just not free.)

## The hooks

`useCatalog(search)` initialises state from `peek(url)`: if the entry exists
the first render has `data` and `isLoading: false`, so the skeleton never
mounts. The effect calls `load` instead of `fetch`. The request-ordering
guard (`requestId`) stays; it still matters when filters change faster than
the server answers. `useTutorials()` gets the same change with one fixed
URL. Neither hook changes its return shape, so no screen changes for the
cache.

## The tutorials skeleton

The `isLoading` branch in `Tutorials.tsx` renders the real page frame: the
hero with its title and lead, the coverage sentence and the provenance note
replaced by shimmer bars (their numbers are not known yet), the search box
present but disabled, an empty rail column, and a `tut-grid` of nine
shimmer tiles shaped like the split card (148px media block, three text
bars). The error state and the "library not built yet" state are untouched.

Styles go in `tutorials.css` under `.tut-skeleton*`, with their own
`@keyframes tut-shimmer` and a `prefers-reduced-motion` rule, because the
two stylesheets deliberately do not import each other.

## Tests

`ui/src/lib/fetchCache.test.ts` (vitest, `fetch` mocked):

- `peek` is `undefined` before a load and the parsed body after.
- A second `load` of the same URL does not call `fetch`.
- Two concurrent `load`s of one URL share a single `fetch`.
- A rejected fetch leaves nothing cached; the next `load` fetches again.
- A non-2xx response rejects with the status in the message and is not cached.

Verification: `npx tsc --noEmit`, `npm run build`, `npm run lint`,
`npm test`, then in the browser: Catalog (skeleton) → Tutorials (skeleton)
→ Catalog (instant) → Tutorials (instant), with the Network tab showing one
`/catalog` and one `/tutorials` request in total.
