# Status pages: 404 and the error boundary

**Date:** 2026-09-19
**Status:** approved, implemented the same day

## What

Two pages the app did not have: one for a URL that matches nothing, and one
for a page that throws while rendering. Until now the first showed Next's
unstyled default and the second showed Next's red dev overlay (and a blank
page in production).

## Files

| File | Role |
|---|---|
| `ui/src/app/not-found.tsx` | Root not-found boundary. Next serves it for every unmatched URL and prerenders it as `/_not-found`. Client component so it can read `usePathname()` and name the address that failed. |
| `ui/src/app/error.tsx` | Root error boundary. Receives `{ error, reset }`; must be `"use client"`. Logs the error in an effect so it still reaches the browser console, and shows `error.digest` when present, since that is what someone would quote in a bug report. |
| `ui/src/components/status/StatusPage.tsx` | Presentational shell shared by both: `stamp`, `title`, `lead`, optional `figure`, children for the action row. Nothing else. |
| `ui/src/status.css` | Tokens redeclared under `--s-*`, as `auth.css` and `landing.css` do, so the file stands alone. |

Both pages render inside `layout.tsx`, so the navbar stays on screen and is
itself a way out. `global-error.tsx` (root layout crashes) is deliberately
not built; it would duplicate the document shell for a case nobody has hit.

## Look

The Vercel system from DESIGN.md, no colour, no card. Type sits straight on
the paper canvas, centred, in a 560px column with 16px gutters:

- stamp: Geist Mono 11px, uppercase, 0.071em, obsidian
- figure (404 only): Geist Sans, `clamp(64px, 10vw, 96px)`, weight 450,
  -0.06em, line-height 1
- title: Geist Sans 30px, weight 400, -1.5px
- lead: 16px charcoal, max 44ch
- actions: one filled black button (6px radius, 40px tall) and one ghost
  (hairline ring), plus a text link where a third route out earns its place
- reference line (error only): Geist Mono 12px graphite

`.status` is `flex: 1 1 auto` under the navbar and centres vertically, for
the reason `auth.css` gives: a few lines of type at the top-left of a blank
page reads as a broken layout.

## Copy

Sentence case, no em dashes, says what happened and what to do next
(DESIGN.md §10, Voice).

**404**

- stamp `Not found`, figure `404`
- title "There's nothing at this address"
- lead "`/the/path` doesn't exist here. The link may be old or mistyped. The
  catalogue, tutorials and community are all still where they were."
- actions: "Browse the catalogue" → `/` (filled), "Tutorials" → `/tutorials`
  (ghost), "Ask the assistant" → `/assistant` (text link)

**Error**

- stamp `Error`
- title "This page hit an error"
- lead "Something went wrong while it was rendering. That's on our side, not
  yours. Trying again usually works, and the rest of the site is unaffected."
- actions: "Try again" calls `reset()` (filled), "Back to the catalogue" →
  `/` (ghost)
- below, only when `error.digest` exists: "Reference {digest}"

## Verification

`npx tsc --noEmit`, `npm run build` (confirms `/_not-found` prerenders and
nothing reads `window` during render), `npm run lint` with no new warnings.
In the browser: `/does-not-exist` for the 404; a temporary `throw` in a page
for the error boundary, reverted afterwards.
