# Vercel-style catalogue preview

**Status:** preview, on branch `vercel-preview`. Not merged. Decides nothing
until someone has looked at it with real data.

## Why

The current design system (DESIGN.md) is thepihut's catalogue geometry with
NVIDIA's green accent and an amber data accent. The candidate replacement is
Vercel's system: an achromatic, hairline-bordered, mono-labelled interface
that reads like a typeset terminal. Before deciding, restyle one page and look.

The catalogue is the page to test on. It is the front door and it touches the
most components — navbar, filter sidebar, result bar, product cards,
pagination, chat launcher — so if the style holds there it holds anywhere.

## Scope

The catalogue came first, as the test. Once it held, the same system went on
to every other page — the whole app is the preview now. No component logic,
no server, no DESIGN.md.

| File | Change |
|---|---|
| `ui/src/app/layout.tsx` | Add Geist Sans and Geist Mono to the Google Fonts link. Lato and Plex stay loaded but nothing reads them any more. |
| `ui/src/components/Navbar.tsx` | One 64px bar on `#fafafa` with a hairline bottom border. Wordmark, category links, Tutorials/Community pushed right, account cluster at the far end. Categories render in sentence case. No hamburger icon, no grey strip. |
| `ui/src/catalog.css` | Every token, type and spacing value moves to the Vercel system. The `[ref]` comments (thepihut measurements) go, because the reference has changed. |
| `ui/src/tutorials.css`, `ui/src/community.css`, `ui/src/auth.css` | Token blocks swapped to Vercel values under the existing names, so the selectors read the same. Radii to 6px, shadows to the stacked ring, green and amber to ink, inputs and buttons to the ghost/filled pair, labels to mono eyebrows, `calc(100vh - 106px)` to `- 64px`. |
| `ui/src/chatbox.css`, `chatbox.tsx`, `ChatMessage.tsx`, `Loader.tsx`, `public/advisor.svg` | The chat panel: `top: 64px`, Geist, bubbles as 6px cards with the speaker corner squared, the user bubble as the inverted `#171717` surface, robot cards matched to `.pcard`, icons and avatar in ink. This is the upstream NVIDIA stylesheet; the SPDX header stays. |
| `ui/src/index.css` | `body` font to Geist, `.product-pane` to 64px. |

**One chromatic pixel survives.** The `✓` on a verified-seller stamp in the
chat's robot cards is Terminal Green `#297a3a`, Vercel's one permitted accent,
because "verified" is the one fact in the app a colour has always meant.
Nothing in the current crawl sets `seller_verified`, so it does not render
today.

## Mapping

Vercel token → where it lands on the catalogue.

**Colour.** Page canvas `#fafafa`. Cards `#ffffff` with the stacked-ring
border (`0 0 0 1px rgba(0,0,0,0.08), 0 0 0 2px #fafafa`), no shadow, no hover
lift. Text `#171717` / `#4d4d4d` / `#666666`. Rules `#ebebeb`. Checkbox
accent `#171717`. **No green anywhere on this page.** Price is `#171717`.

**Type.** Geist Sans for reading; Geist Mono, 11–13px, uppercase, `0.071em`
tracking for every label, eyebrow, count, and figure. This keeps DESIGN.md's
mono-for-numbers rule and extends it to labels, which is Vercel's rule.

| Element | Setting |
|---|---|
| Breadcrumb | Mono 12px, `#666` |
| Page title | Sans 30px / 400 / `-1.5px` tracking / line-height 1.1 |
| "Showing 1–48 of 2,880" | Sans 14px `#4d4d4d`, figures in mono |
| Sort label | Mono 11px eyebrow |
| Facet heading | Mono 11px eyebrow, `#171717` |
| Facet option | Sans 14px `#4d4d4d`; count in mono 12px `#8f8f8f` |
| Card brand | Mono 11px eyebrow, `#666` |
| Card name | Sans 14px / 500 / 1.43, two-line clamp |
| Card meta | Sans 13px `#666` |
| Card price | Mono 14px / 500 `#171717` |
| Seller count | Mono 11px `#8f8f8f` |
| Out of stock | Mono 11px uppercase, hairline pill, `#666` on `#fafafa` |
| Pagination | Mono 13px |

**Buttons.** Ghost outline (transparent, `#4d4d4d`, 1px `#ebebeb` ring, 6px
radius) for "View at seller", "Clear all filters", and inactive page numbers.
On hover the ghost inverts to filled `#171717` / white. Filled `#171717` for
the current page number and the chat launcher (as a 9999px pill).

**Layout.** Max-width 1280px, 24px gutters. Sidebar 240px, 40px gap. Sidebar
has no panel: facets are separated by hairline rules. Grid is
`repeat(auto-fill, minmax(200px, 1fr))` with 16px gaps, so the fixed 183px
tracks go. Section gaps stay compact — this is a catalogue, not a landing page,
and DESIGN.md's page-header rule (first card above the fold at 1440×900)
still applies.

## What stays the same

Filter state in the query string. The `useCatalog` hook. `ProductCard`,
`FilterSidebar` and `Catalog` markup. The chat widget's geometry overrides
(they re-frame `chatbox.css`, which is untouched upstream). Skeleton and empty
states keep their copy; they change colour only.

## What the accents became

DESIGN.md's three-colour budget (green for actions, amber for data, green for
verified) collapses to tone:

| Was | Now |
|---|---|
| Green button, green link | Filled `#171717` button for the one primary action on a page; ghost outline for the rest; charcoal underlined text for links |
| Green focus ring | Ink ring, offset by a canvas ring |
| Amber skill / level chip | The one chip drawn with an ink border |
| Amber rating segments | Filled ink segments on hairline grey |
| Amber "dead on arrival" count | Ink at medium weight, in the sentence |
| Amber tutorial count on a card | Mono ink stamp |
| Red error text | Ink at medium weight; the field takes an ink ring |
| Green "check your inbox" tint | Hairline panel with a `✓` in Terminal Green |
| Verified-seller green fill | Mono `✓ VERIFIED` stamp, the tick in Terminal Green |

## Known tensions if adopted

- DESIGN.md is descriptive of what the app renders. If this is adopted it gets
  rewritten after the pages change, not before. Every colour, radius and type
  value in it is now wrong.
- `chatbox.css` was "untouched upstream styling" (CLAUDE.md). It is touched
  now; the catalogue's `.chat-widget` overrides in `catalog.css` still only
  re-frame it and do not restyle it, so the rule's intent holds.

## Done when

`npx tsc --noEmit`, `npm run build` and `npm run lint` are clean, the browser
console is clean, and screenshots of every page at 1440×900 show the first
row of content above the fold.
