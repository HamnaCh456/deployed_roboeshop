# Dashboard: the signed-in home

**Date:** 2026-09-19
**Status:** approved (variant B of the three mockups, chosen by the user)
**Route:** `/dashboard`

## What it is

One page that shows the whole of Servo at a glance and lands a person there
after they sign in or sign up. Two columns: a left rail that belongs to the
person (name, their community activity, quick links) and a main column that
is the platform overview (counts, categories, cheapest-across-stores,
newest tutorials, community this week).

It is the "overview + your activity" reading. It is *not* a personal home
with saved lists, compare sets or chat history: none of that data exists
yet. Every panel is fed by an endpoint or table the app already has, and
the two personal figures the mockup marked as examples (reviews written,
helpful votes received) are real counts over existing tables.

## Why B

- The person's own things stay in view rather than being scrolled past.
- It is the shape the page grows into: a saved list or compare set is one
  more rail card, no relayout.
- The trade-off, an empty-looking rail for a new account, is handled by
  writing the empty state as an invitation ("Your first review goes here")
  rather than a row of zeros.

## Layout

Desktop (≥ 900px): `280px 1fr` grid, 20px gap, inside the 1280px shell the
other pages use. The main column opens with the page header (title, one
lead, the ask bar beside them), then a four-cell stat strip, then two rows
of two cards. The rail is three cards: **You**, **Your latest review**,
**Quick links**.

Below 900px the rail moves *under* the main column; the two-card rows stack
to one column below 720px. The page header keeps DESIGN.md §10: title on one
line, the control beside it, first content row above the fold at 1440×900.

## Panels and what feeds them

| Panel | Source | Notes |
|---|---|---|
| Header lead | `GET /health` (robots), `config.ui.stores` | "2,880 products across 5 stores" |
| Ask bar | A form that navigates to `/assistant?q=` | `AssistantScreen` already reads `q` and sends it as the first message, the same contract the landing page's `AskBar` uses. |
| Stat strip | `/health`, unfiltered `/catalog` facets, `/tutorials` | Products, listed on 2+ stores, tutorials (with the priced count, derived client-side from `parts.length > 0`), categories. The "2+ stores" figure is `multiSeller`, a new field on `/health`: the count of products with more than one offer. It is a fact about the crawl and belongs beside the other two counts. |
| Catalogue by category | `facets.category` from the unfiltered `/catalog` | Six rows, bar length relative to the largest, count in mono, each row links to `/catalog/[slug]` |
| Cheapest across stores | `GET /catalog?sort=sellers-desc` | First four products with `offerCount > 1`. Price is the lowest offer (`price`/`currency` already are). The "to Rs N" ceiling needs the offers list, which `/catalog` cards do not carry: **show "N stores" and the lowest price only.** |
| Newest tutorials | `GET /tutorials` | First two by `publishedAt` desc; thumbnail with the "No photo" tile fallback; author, level, priced-parts count |
| Community this week | `reviews` newest 3 via `listReviews()` | Product name, author, rating, helpful count |
| You (rail) | `useAuth()` + `profiles.created_at` | Avatar initial, display name, "Member since Sep 2026"; counts: reviews written, replies written, helpful votes received (sum of `helpful` over own reviews). `created_at` is added to the `Profile` the AuthContext exposes. |
| Your latest review (rail) | own reviews, newest | Product, first line of body, rating, helpful count, reply count; link to `/community` |
| Quick links (rail) | Fixed hrefs | Five catalogue/tutorial URLs. Filter state is the query string, so each is a plain link. |

## Signed-out visitors

Nothing on the site is behind a login wall (CLAUDE.md), so `/dashboard`
renders for everyone. Signed out, the rail's first card is a sign-in card
("Sign in to see your reviews and votes here") with a filled button to
`/auth/login?next=/dashboard`, and the other two rail cards are dropped.
While `status === "loading"` the rail renders its skeleton, so a signed-in
visitor never sees the sign-in card flash.

## Redirects after auth

- `LoginForm`: `safeNext(next, "/dashboard")` instead of `"/"`.
- `SignUpForm`: `AFTER_SIGN_UP = "/dashboard"`.
- `auth/confirm/route.ts`: fallback `/dashboard`.
- `Navbar`: when signed in, "Dashboard" appears in the account group,
  before the display name. The display name itself links to `/dashboard`.

`/` stays the public landing page.

## Files

- `ui/src/app/dashboard/page.tsx`: renders `<Dashboard />`.
- `ui/src/components/dashboard/Dashboard.tsx`: the page. Data via
  `useDashboard()`.
- `ui/src/hooks/useDashboard.ts`: one hook that gathers health, catalog
  facets, multi-seller products, tutorials, reviews and replies through
  `fetchCache` / `reviewStore`, and derives the personal counts from the
  session id. Returns loading and error per source, so one dead source
  (Supabase down) degrades one panel, not the page.
- `ui/src/dashboard.css`: tokens redeclared, as `community.css` and
  `tutorials.css` do. Shares no CSS with either.
- Pure formatters (`priceUnit`, `groupDigits`, `timeAgo`) are imported
  from `components/community/format.ts`. They are functions, not styling;
  the "no shared code" rule is about rails and stylesheets.
- `mock-server/server.js`: `/health` gains `multiSeller`.
- `ui/src/context/AuthContext.tsx`: `Profile` gains `createdAt`.

## Empty and error states (DESIGN.md §10, Voice)

- Tutorials empty: "No tutorials indexed yet. Run `run_tutorials.py` to
  build the library."
- Reviews empty: "Nothing reviewed yet. The first review is the one that
  makes the page worth reading." with a link to write one.
- Own reviews empty: "Your first review goes here. Say what board you
  tested it on."
- Catalogue unreachable: the stat strip and both catalogue cards show
  "The catalogue server isn't answering. Start `mock-server` and reload."
- Supabase unreachable: the community card and rail show the store's
  thrown sentence.

## Not in scope

Saved lists, compare sets, price history (still empty until repeat crawls),
persisted chat history, tutorial progress. Each is a rail card later.

## Verification

`npx tsc --noEmit`, `npm run build`, `npm run lint` (no new warnings), a
clean console on `/dashboard` signed in and signed out, and the three
breakpoints (1440, 900, 400) checked by eye.
