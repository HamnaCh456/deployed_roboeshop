# Responsive layout

**Date:** 2026-09-19
**Status:** Approved

## Problem

The app was built and measured at a 1440px viewport. Every page has a partial
breakpoint stack (catalogue at 1120/820, tutorials and community at
1080/900/640, landing at 1024/760), but three things have none:

- The navbar. Its category `nav` is `min-w-0` while every link is `shrink-0`,
  so below about 1200px the nav collapses and the links draw on top of
  "Tutorials", "Community" and the account name. One row cannot hold six
  categories, three editorial links and a signed-in name.
- `/assistant`: a 40vw image beside a 60vw fixed chat panel, at every width.
- The filter rails. Below their collapse breakpoint all three stack above the
  results with every group open, so a phone shows some thirty checkbox rows
  before the first product.

The navbar height is also hard-coded as `64px` in six files, which any change
to the bar breaks.

## Decisions

Chosen with mockups at 390px; see `.superpowers/brainstorm/` for the options
that were not taken (a menu button, a filter sheet).

### Range and breakpoints

Supported: 360px to 1440px. Existing breakpoints stay. One threshold is added:

| Width | Change |
|---|---|
| `≤1280px` | Navbar link gaps 24px → 16px, account divider padding 24px → 16px |
| `≤1120px` | Navbar goes two rows (same threshold as the catalogue's first breakpoint) |
| `≤900px` (tutorials, community), `≤820px` (catalogue) | Rails collapse into the accordion described below; `/assistant` drops the image |
| `≤640px` | Phone: display name hidden from the navbar; corner chat widget fills the screen |

### Navbar: two rows

- **Top row (64px):** wordmark, then pushed right: Tutorials, Community, the
  Ask pill. Never more than four items, so it never wraps.
- **Second row (40px):** the six categories as a strip that scrolls sideways
  with the scrollbar hidden (`scrollbar-width: none` and the webkit
  equivalent), then a hairline, then the account: "Sign in", or the display
  name and "Sign out". The name is hidden below 640px; "Sign out" stays.
- Above 1120px the bar is exactly what it is today, one row.
- The header is one element with two `nav`s inside; CSS reflows it. The
  account block is rendered once and moved by `order`/placement, not
  duplicated, so the session is read in one place.

### `--nav-h`

`:root { --nav-h: 64px }`, `104px` at `≤1120px`. Replaces the literal in:
`catalog.css` (`.catalog` height), `tutorials.css`, `community.css`,
`landing.css` (two places), `index.css` (`.product-pane`), and
`chatbox.css` (`.chatbox` `top`). The `.chat-widget` height formula in
`catalog.css` reads it too. The layout's `h-screen` becomes `h-dvh` so the
mobile browser toolbar does not hide the bottom of the page.

### Filters: collapsed accordion

Same behaviour in all three rails, implemented three times on purpose
(CLAUDE.md: two pages with a checkbox list is a coincidence; lift a shared
rail when a third one needs it — this is the third, but the rails also carry
different class prefixes, labels and CSS files, and the brief is
responsiveness, not a refactor. Record it as the point where a shared rail
became reasonable).

- Desktop: unchanged. Every group open, catalogue keeps its chevrons,
  tutorials and community keep their plain legends.
- Below the page's collapse breakpoint: each group is a heading row with a
  chevron, closed by default. A group with a ticked option starts open so the
  active filter is visible. Opening one group does not close another.
- "Clear filters" stays at the end of the rail.
- The open/closed state is component state, not the URL; it is presentation.
- Detection of "below the breakpoint" is a `matchMedia` hook read in an
  effect (never during render: the pages are statically prerendered).

### `/assistant`

Below 820px `.product-pane` is `display: none` and `.chatbox` is
`left: 0; width: auto`. `chatbox.css` is upstream styling, so the override
lives in a media query appended to `index.css` beside `.product-pane`, not
inside `chatbox.css`'s rules.

### Catalogue chat widget

Below 640px `.chat-widget` is `inset: var(--nav-h) 0 0 0; width: auto;
height: auto` (full screen under the bar), and the launcher clears
`env(safe-area-inset-bottom)`.

### Sweep

Screenshots at 360, 390, 768, 1024 and 1280 on `/`, `/catalog/sensors`,
`/tutorials`, `/community`, `/assistant`, `/auth/login`. Anything that
overlaps, scrolls the page sideways, or cannot be reached gets a rule in that
page's own CSS file with a comment saying why, in the same style as the
existing breakpoint blocks.

## Out of scope

- A filter sheet or a menu button (rejected in brainstorming).
- Touch-specific interactions, hover replacements.
- Dark mode.
- Sharing the three rails.

## Verification

`npx tsc --noEmit`, `npm run build`, `npm run lint` (no new warnings), then
the screenshot pass above through Chrome DevTools with the dev server the
user runs on port 3000. Pass criteria per route and width: no horizontal
page scroll, no overlapping text, every link and control reachable, the
console clean.
