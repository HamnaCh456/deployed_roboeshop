# Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen works from 360px to 1440px: a two-row navbar below 1120px, filter rails that collapse into an accordion on narrow screens, a full-width assistant on phones, and no overlapping or off-screen controls anywhere.

**Architecture:** Each page keeps owning its own CSS file and its own breakpoint block (that is how the codebase already works; see `catalog.css` "responsive", `tutorials.css` "RESPONSIVE"). The navbar's height becomes a `:root` token so no page hard-codes `64px`. Three rail components each get a per-group open/closed toggle driven by a `useMediaQuery` hook; they stay siblings, not a shared component (CLAUDE.md). Nothing reads `window` during render: the pages are statically prerendered.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 3.3 (utilities on the navbar only), plain CSS per page, MUI icons. Verification is `npx tsc --noEmit`, `npm run build`, `npm run lint`, and the Chrome DevTools MCP against the dev server the user runs on port 3000 (do not start a second one; read `ui/.next/dev/logs` if it misbehaves).

Spec: `docs/superpowers/specs/2026-09-19-responsive-layout-design.md`.

All paths below are relative to the repository root. Commands run from `ui/` unless stated.

---

### Task 1: The navbar height token

The literal `64px` lives in seven places. Replace it with `--nav-h`, and give the app shell a `dvh` height so the mobile browser toolbar does not hide the bottom of the page.

**Files:**
- Modify: `ui/src/index.css:36-48` (navbar comment block) and `:69-77` (`.product-pane`)
- Modify: `ui/src/app/layout.tsx:68`
- Modify: `ui/src/catalog.css:36`, `:645`
- Modify: `ui/src/tutorials.css:42-43`
- Modify: `ui/src/community.css:44-45`
- Modify: `ui/src/landing.css:36`, `:205`
- Modify: `ui/src/chatbox.css:112`

- [ ] **Step 1: Declare the tokens in `index.css`**

Insert directly after the `code { ... }` rule (line 34), before the navbar comment:

```css
/* Layout tokens every page reads. `--nav-h` is the navbar's height: one row
   on desktop, two below 1120px (see .nav-bar below). `--page-h` is what is
   left for a page under it. Pages that fill the viewport set
   `height: var(--page-h)` instead of subtracting a navbar height they would
   otherwise have to know. `dvh` follows the mobile browser toolbar as it
   hides; `vh` does not, and the fallback is for browsers without `dvh`. */
:root {
  --nav-h: 64px;
  --page-h: calc(100vh - var(--nav-h));
}

@supports (height: 100dvh) {
  :root {
    --page-h: calc(100dvh - var(--nav-h));
  }
}

@media (max-width: 1120px) {
  :root {
    --nav-h: 104px;
  }
}

/* The flex column that holds the navbar and the page. Tailwind 3.3 has no
   `h-dvh`, so the height is set here: the second declaration wins where
   `dvh` is understood and is ignored where it is not. */
.app-shell {
  height: 100vh;
  height: 100dvh;
}
```

- [ ] **Step 2: Use `.app-shell` in the layout**

In `ui/src/app/layout.tsx` line 68 change

```tsx
          <div className="bg-[#fafafa] flex flex-col h-screen w-screen">
```

to

```tsx
          <div className="app-shell bg-[#fafafa] flex flex-col w-screen">
```

- [ ] **Step 3: Replace the seven literals**

`ui/src/index.css` `.product-pane`: replace the comment and the height:

```css
/* Left product pane. Fills the band under the navbar, the same band the fixed
   chat panel occupies. */
.product-pane {
  width: 40vw;
  height: var(--page-h);
```

`ui/src/catalog.css` line 36:

```css
  height: var(--page-h);           /* the band under the navbar */
```

`ui/src/catalog.css` lines 644-645 (inside `.chat-widget`):

```css
  /* The navbar above, 80px of launcher below, 16px clear. */
  height: min(620px, calc(100vh - var(--nav-h) - 96px));
```

`ui/src/tutorials.css` lines 42-43:

```css
  /* The band under the navbar, matching .catalog. */
  height: var(--page-h);
```

`ui/src/community.css` lines 44-45:

```css
  /* The band under the navbar, matching .tutorials. */
  height: var(--page-h);
```

`ui/src/landing.css` line 36:

```css
  height: var(--page-h);
```

`ui/src/landing.css` line 205 (inside `.landing .hero`):

```css
  height: var(--page-h);
```

`ui/src/chatbox.css` lines 112-113:

```css
  top: var(--nav-h);               /* below the navbar, whatever its height */
```

(delete the "Was 64px to clear the page footer" comment line; it is about `bottom`, which stays `0`.)

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build finishes with every route listed as static (`○`).

- [ ] **Step 5: Check nothing moved at desktop**

With the dev server on port 3000, use the Chrome DevTools MCP: `new_page` at `http://localhost:3000/catalog`, `resize_page` to 1440×900, `take_screenshot`. The page should look exactly as before: navbar 64px, catalogue filling the rest with its own scrollbar. Repeat for `/assistant` (chat panel starts directly under the bar, no gap, no overlap).

- [ ] **Step 6: Commit**

```bash
git add ui/src/index.css ui/src/app/layout.tsx ui/src/catalog.css ui/src/tutorials.css ui/src/community.css ui/src/landing.css ui/src/chatbox.css
git commit -m "Read the navbar height from one token

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Two-row navbar

Below 1120px the bar becomes two rows: wordmark and the editorial links on top, the category strip and the account underneath. The DOM order does not change; a grid in `index.css` reflows it. The layout utilities leave `Navbar.tsx` for class names in `index.css`, because a two-row reflow with `order`-free grid placement is beyond what Tailwind 3.3's utilities express cleanly; the colour and type utilities on the links stay.

**Files:**
- Modify: `ui/src/components/Navbar.tsx:40-142`
- Modify: `ui/src/index.css` (the `.nav-bar` block)

- [ ] **Step 1: Restructure `Navbar.tsx`**

Replace lines 40-142 (the doc comment through the closing of the component) with:

```tsx
/**
 * One 64px bar, Vercel-style: wordmark, then the category links, then the
 * editorial pages pushed to the far end. Separation from the page is a
 * hairline, not a grey strip. See
 * docs/superpowers/specs/2026-09-19-vercel-style-catalogue-preview-design.md.
 *
 * Below 1120px it is two rows (docs/superpowers/specs/2026-09-19-responsive-
 * layout-design.md): wordmark and editorial links on top, the categories as
 * a sideways-scrolling strip underneath with the account at its end. The
 * markup is the same in both; `.nav-bar` in index.css is a grid that places
 * the four blocks, so the session is read and rendered exactly once.
 */
const Navbar: React.FC = () => {
  const { brand, categories } = config.ui;
  const pathname = usePathname();
  const { status, displayName, signOut } = useAuth();

  // Where sign-in should come back to. Never an auth page itself, or a
  // successful sign-in would land on the form it just left.
  const returnTo = pathname.startsWith("/auth/") ? "/" : pathname;

  // The category links used to be dead `#`s. They now filter the catalogue,
  // which is what the query string in /catalog/[category] carries.
  // `whitespace-nowrap` matters: the bar is a fixed height, so a label that
  // wraps to two lines breaks the bar rather than growing it.
  const linkClass = (isActive: boolean) =>
    "shrink-0 whitespace-nowrap text-[14px] font-normal no-underline " +
    (isActive ? "text-[#171717]" : "text-[#666666] hover:text-[#171717]");

  // react-router's NavLink did this for us; next/link has no active state.
  const isActive = (href: string) => pathname === href;

  return (
    <header className="nav-bar">
      <Link
        href="/"
        className="nav-bar__brand shrink-0 flex items-center gap-2 text-[14px] font-medium text-[#171717] no-underline"
      >
        {/* A plain black square: the wordmark's glyph, and the one element
            allowed to be pure #000. */}
        <span
          aria-hidden="true"
          className="inline-block w-[10px] h-[10px] bg-[#000000]"
        />
        {brand}
      </Link>

      <nav className="nav-bar__categories" aria-label="Categories">
        {categories.map((category) => {
          const href = `/catalog/${categorySlug(category)}`;
          return (
            <Link key={category} href={href} className={linkClass(isActive(href))}>
              {sentenceCase(category)}
            </Link>
          );
        })}
      </nav>

      {/* Pushed to the far end: tutorials and community reviews are a
          different kind of thing from a product category, and the gap says
          so. They sit together because both are the editorial layer the
          source sites do not carry. */}
      <nav className="nav-bar__editorial" aria-label="Editorial">
        <Link href="/tutorials" className={linkClass(isActive("/tutorials"))}>
          Tutorials
        </Link>
        <Link href="/community" className={linkClass(isActive("/community"))}>
          Community
        </Link>
        {/* The assistant is the product's argument, so it gets the bar's one
            filled control: the Vercel pill, ink on paper, 9999px in the tight
            header context where a 6px rectangle would read as a form field. */}
        <Link
          href="/assistant"
          className="shrink-0 whitespace-nowrap rounded-full bg-[#171717] px-[14px] py-[6px] text-[14px] font-normal leading-none text-white no-underline hover:bg-black"
        >
          Ask {brand}
        </Link>
      </nav>

      {/* Who is signed in. Renders nothing while the session is still being
          read, so a signed-in visitor never sees "Sign in" flash for a frame.
          The sign-in link carries the current path so it comes back here. A
          hairline on the left separates the account from the editorial pages
          the way the bar's bottom rule separates it from the page. */}
      <div className="nav-bar__account text-[14px] whitespace-nowrap">
        {status === "signed-in" && (
          <>
            <span className="nav-bar__name text-[#171717]">
              {displayName || "Signed in"}
            </span>
            <button
              type="button"
              className="text-[#666666] hover:text-[#171717]"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </>
        )}
        {status === "signed-out" && (
          <Link
            href={`/auth/login?next=${encodeURIComponent(returnTo)}`}
            className={linkClass(pathname.startsWith("/auth/"))}
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
};
```

- [ ] **Step 2: Replace the `.nav-bar` block in `index.css`**

Replace lines 36-48 of the original file (the "Navbar. It is a fixed 64px" comment through `.nav-bar::-webkit-scrollbar { display: none; }`) with:

```css
/* NAVBAR
   ======
   One row on desktop: wordmark | categories (fills, scrolls sideways if it
   must) | editorial | account. The native horizontal bar is hidden on the
   category strip because at 15px tall it would take a quarter of the bar.
   Geist is the preview's face; the link colours and sizes are Tailwind
   classes in Navbar.tsx. Everything that decides *where* a block sits is
   here, so the two-row reflow below is one media query, not a second
   markup tree. */
.nav-bar {
  flex: 0 0 auto;
  box-sizing: border-box;
  height: var(--nav-h);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  grid-template-rows: minmax(0, 1fr);
  align-items: center;
  column-gap: 24px;
  padding: 0 24px;
  background: #fafafa;
  border-bottom: 1px solid #ebebeb;
  font-family: Geist, "Geist Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

.nav-bar__brand {
  margin-right: 16px;
}

.nav-bar__categories,
.nav-bar__editorial,
.nav-bar__account {
  display: flex;
  align-items: center;
  gap: 24px;
  min-width: 0;
}

.nav-bar__categories {
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.nav-bar__categories::-webkit-scrollbar {
  display: none;
}

.nav-bar__account {
  gap: 16px;
  padding-left: 24px;
  border-left: 1px solid #ebebeb;
}

/* Between 1120 and 1280 the single row is only just too wide once a display
   name is in the account block, so the gaps tighten before the bar breaks
   into two rows. */
@media (max-width: 1280px) {
  .nav-bar,
  .nav-bar__categories,
  .nav-bar__editorial {
    column-gap: 16px;
    gap: 16px;
  }

  .nav-bar__account {
    padding-left: 16px;
  }
}

/* Two rows. Row one is the original 64px less the bottom rule; row two is a
   40px strip. `--nav-h` in :root is 104px at this width for the same reason.
   The wordmark and the editorial links keep row one to four items, so it
   never wraps; the categories take row two and scroll sideways; the account
   sits at the strip's end behind a hairline. */
@media (max-width: 1120px) {
  .nav-bar {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-rows: minmax(0, 1fr) 40px;
    padding: 0 16px;
  }

  .nav-bar__brand {
    grid-row: 1;
    grid-column: 1;
    margin-right: 0;
  }

  .nav-bar__editorial {
    grid-row: 1;
    grid-column: 2 / 4;
    justify-self: end;
  }

  .nav-bar__categories {
    grid-row: 2;
    grid-column: 1 / 3;
    align-self: stretch;
    border-top: 1px solid #ebebeb;
  }

  .nav-bar__account {
    grid-row: 2;
    grid-column: 3;
    align-self: stretch;
    border-top: 1px solid #ebebeb;
  }
}

/* Phone. The display name goes; "Sign out" stays so the control does. The
   pill, two links and the wordmark fit 360px only with 12px gaps. */
@media (max-width: 640px) {
  .nav-bar {
    column-gap: 12px;
    padding: 0 12px;
  }

  .nav-bar__editorial {
    gap: 12px;
  }

  .nav-bar__categories {
    gap: 20px;
  }

  .nav-bar__name {
    display: none;
  }
}
```

- [ ] **Step 3: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean; lint warnings unchanged in count from before this task (run `npm run lint 2>&1 | tail -3` before and after; the number must not rise).

- [ ] **Step 4: Verify in the browser at four widths**

Chrome DevTools MCP against `http://localhost:3000/catalog/sensors`, signed in if possible (the display name is the widest case):

| `resize_page` | Expect |
|---|---|
| 1440×900 | One row, identical to before. "Sensors" is ink, the rest slate. |
| 1200×800 | Still one row; gaps visibly tighter; nothing overlaps. |
| 1024×768 | Two rows. Row 1: wordmark left, Tutorials / Community / Ask Servo right. Row 2: six categories, hairline, name + Sign out. |
| 390×844 | Two rows. Row 1 fits with no wrap. Row 2 scrolls sideways (drag or `evaluate_script` `document.querySelector('.nav-bar__categories').scrollLeft = 200`), no scrollbar visible, "Sign out" (no name) at the end. |

Also run `evaluate_script` with `document.documentElement.scrollWidth <= window.innerWidth` at 390: must be `true` (no page-level sideways scroll). Take a screenshot at each width.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/Navbar.tsx ui/src/index.css
git commit -m "Break the navbar into two rows below 1120px

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `useMediaQuery`

One hook the three rails use to know they are below their collapse breakpoint. `useSyncExternalStore` rather than state-in-an-effect: it needs no `setState` inside `useEffect` (the lint rule the upstream code already trips, and CLAUDE.md says not to add to those warnings), and its server snapshot makes the prerender deterministic.

**Files:**
- Create: `ui/src/hooks/useMediaQuery.ts`

- [ ] **Step 1: Write the hook**

```ts
"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the viewport currently matches a media query, kept current as the
 * window resizes.
 *
 * The server snapshot is `false`: the pages are statically prerendered, so
 * the first render has no window to ask, and a component must render the
 * same thing on the server and on the client's first pass. React swaps in
 * the real answer before the first paint, so a phone does not flash the
 * desktop layout.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (the file is unused yet; that is fine for tsc, and `noUnusedLocals` does not apply to exports).

- [ ] **Step 3: Commit**

```bash
git add ui/src/hooks/useMediaQuery.ts
git commit -m "Add useMediaQuery for the rails' collapse breakpoint

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Catalogue facets collapse on narrow screens

Below 820px the sidebar stacks above the grid. Every group starts closed unless it has a ticked option, and the page order becomes breadcrumb, title, facets, result bar, grid, so the title still comes first. Desktop keeps its current behaviour (all open, chevrons work).

**Files:**
- Modify: `ui/src/components/catalog/FilterSidebar.tsx:14-63`
- Modify: `ui/src/catalog.css:586-596` (the responsive block)

- [ ] **Step 1: Derive the open state from the viewport in `FacetGroup`**

In `ui/src/components/catalog/FilterSidebar.tsx` add the import after line 16:

```ts
import { useMediaQuery } from "../../hooks/useMediaQuery";
```

and add, after the imports:

```ts
/** Where `.catalog__columns` in catalog.css goes to one column. Keep the
 *  two in step. */
const NARROW = "(max-width: 820px)";
```

Replace the body of `FacetGroup` from `const [isOpen, setIsOpen] = React.useState(defaultOpen);` through the `onClick` on the heading button (lines 44-55) with:

```tsx
  const isNarrow = useMediaQuery(NARROW);
  // `null` means the visitor has not touched this group, so the viewport
  // decides: open on desktop, closed on a phone unless something in it is
  // ticked, in which case it opens so the active filter is visible. Once
  // toggled, the choice sticks until the page reloads.
  const [choice, setChoice] = React.useState<boolean | null>(null);
  const isOpen = choice ?? (isNarrow ? chosen.length > 0 : defaultOpen);

  if (options.length === 0) return null;

  return (
    <div className="facet">
      <button
        type="button"
        className="facet__heading"
        aria-expanded={isOpen}
        onClick={() => setChoice(!isOpen)}
      >
```

Everything after (`{title}`, the chevron, the list) is unchanged.

- [ ] **Step 2: Restyle the stacked sidebar in `catalog.css`**

Replace the `@media (max-width: 820px)` block at lines 592-596 with:

```css
/* One column. `main` becomes `display: contents` so its children can be
   ordered against the sidebar: the page still opens on the breadcrumb and
   the title, then the facets (every group closed unless it holds a ticked
   option, see FilterSidebar.tsx), then the results. Without this the facets
   would sit above the title, and a phone would open on a list of checkboxes
   with nothing saying what page it is. */
@media (max-width: 820px) {
  .catalog__columns {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .catalog__columns > main { display: contents; }

  .catalog__breadcrumb { order: 1; }
  .catalog__title { order: 2; }
  .catalog__sidebar { order: 3; }
  .catalog__resultbar,
  .catalog__empty,
  .catalog__grid,
  .catalog__pagination { order: 4; }

  .catalog__inner { padding: 0 16px 48px; }

  /* The rail's ruled column becomes an accordion: each heading is a full
     row you can tap, the hairline between groups is the row's rule. */
  .catalog__sidebar {
    padding-top: 12px;
    border-bottom: 1px solid var(--v-hairline);
  }

  .facet + .facet {
    margin-top: 0;
    padding-top: 0;
    border-top: 1px solid var(--v-hairline);
  }

  .facet__heading {
    padding: 12px 0;
  }

  .facet__list {
    margin: 0 0 10px;
  }

  .catalog__clear {
    margin: 4px 0 16px;
  }

  .catalog__grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
}
```

- [ ] **Step 3: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean, warning count unchanged.

- [ ] **Step 4: Verify in the browser**

`http://localhost:3000/catalog` via DevTools:

| Width | Expect |
|---|---|
| 1440 | Sidebar on the left, every group open with chevrons, unchanged. |
| 768 | One column. Order: breadcrumb, "All products", then four closed rows (Category, Price, Platform, Skill level) plus "In stock only", then "Showing 1 – 24 of …", then the grid at two or three cards across. |
| 390 | Same order, two cards across. Tap "Category" (`click` on the heading): the list opens under it, the others stay closed. Tick "Sensors": the URL gains `?category=SENSORS`. Reload: Category is open on load because it holds a tick, Price is closed. |

`evaluate_script` `document.documentElement.scrollWidth <= window.innerWidth` at 390: `true`.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/catalog/FilterSidebar.tsx ui/src/catalog.css
git commit -m "Collapse the catalogue facets into an accordion on narrow screens

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Tutorials rail collapses on narrow screens

Same behaviour as Task 4 for `FilterRail`. Below 900px each group is a heading row with a chevron, closed unless it holds a tick. On desktop the rail is exactly what it is today: legends, every group open, no chevron.

**Files:**
- Modify: `ui/src/components/tutorials/FilterRail.tsx`
- Modify: `ui/src/tutorials.css:977-1015` (the 900px block)

- [ ] **Step 1: Rewrite `FilterRail.tsx`**

Replace the whole file with:

```tsx
/**
 * Faceted filters.
 *
 * Counts are live: each one says how many tutorials that option would leave
 * once the *other* groups are applied, so a zero tells you the combination is
 * empty before you click it.
 *
 * Below 900px the rail stacks above the results, so each group folds into a
 * heading row and starts closed unless it holds a ticked option. On desktop
 * every group is open and the heading is not a control: `.tut-rail__toggle`
 * in tutorials.css turns pointer events off there and hides the chevron.
 */

import React from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { useMediaQuery } from '../../hooks/useMediaQuery';

/** Where `.tut-body` in tutorials.css goes to one column. Keep them in step. */
const NARROW = '(max-width: 900px)';

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface FilterGroup {
  key: string;
  legend: string;
  options: FilterOption[];
}

interface FilterRailProps {
  groups: FilterGroup[];
  /** Selected values, keyed by group. */
  selected: Record<string, string[]>;
  onToggle: (groupKey: string, value: string) => void;
  onClear: () => void;
  hasFilters: boolean;
}

interface RailGroupProps {
  group: FilterGroup;
  chosen: string[];
  onToggle: (value: string) => void;
}

const RailGroup: React.FC<RailGroupProps> = ({ group, chosen, onToggle }) => {
  const isNarrow = useMediaQuery(NARROW);
  // `null` until the visitor toggles the group; the viewport decides before
  // then. Desktop is always open, whatever was chosen on a phone.
  const [choice, setChoice] = React.useState<boolean | null>(null);
  const isOpen = !isNarrow || (choice ?? chosen.length > 0);

  return (
    <fieldset className="tut-rail__group">
      <legend className="tut-rail__legend">
        <button
          type="button"
          className="tut-rail__toggle"
          aria-expanded={isOpen}
          onClick={() => setChoice(!isOpen)}
        >
          {group.legend}
          <ExpandMoreIcon
            fontSize="small"
            className={`tut-rail__chevron${isOpen ? ' tut-rail__chevron--open' : ''}`}
          />
        </button>
      </legend>

      {isOpen &&
        group.options.map((option) => {
          const isOn = chosen.includes(option.value);
          // Dimmed rather than disabled: an option you have already ticked
          // must stay clickable so you can untick it.
          const isEmpty = option.count === 0 && !isOn;

          return (
            <label
              key={option.value}
              className={
                isEmpty ? 'tut-rail__option tut-rail__option--off' : 'tut-rail__option'
              }
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => onToggle(option.value)}
              />
              <span className="tut-rail__label">{option.label}</span>
              <span className="tut-rail__count">{option.count}</span>
            </label>
          );
        })}
    </fieldset>
  );
};

const FilterRail: React.FC<FilterRailProps> = ({
  groups,
  selected,
  onToggle,
  onClear,
  hasFilters,
}) => (
  <aside className="tut-rail" aria-label="Filter tutorials">
    {groups.map((group) => (
      <RailGroup
        key={group.key}
        group={group}
        chosen={selected[group.key] || []}
        onToggle={(value) => onToggle(group.key, value)}
      />
    ))}

    {hasFilters && (
      <button type="button" className="tut-clear" onClick={onClear}>
        Clear filters
      </button>
    )}
  </aside>
);

export default FilterRail;
```

- [ ] **Step 2: Style the toggle at desktop in `tutorials.css`**

After the `.tut-rail__legend { ... }` rule (line 283), add:

```css
/* The legend's text is a button so the group can fold on narrow screens.
   On desktop it is inert: no pointer, no chevron, the same eyebrow as before.
   `font: inherit` and `color: inherit` because the eyebrow rule above sets
   them on the legend and a button resets both. */
.tut-rail__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
  text-align: left;
  cursor: default;
  pointer-events: none;
}

.tut-rail__chevron {
  display: none;
  flex: 0 0 auto;
  width: 16px !important;          /* MUI's `small` is 20px; too big for an 11px stamp */
  height: 16px !important;
  color: var(--muted);
  transition: transform 120ms ease;
}

.tut-rail__chevron--open {
  transform: rotate(180deg);
}
```

- [ ] **Step 3: Replace the rail's 900px rules**

In the `@media (max-width: 900px)` block (lines 977-1015), replace the `.tut-rail { ... }` rule and the `.tut-rail__group { min-width: 160px; }` rule (with its comment) with:

```css
  /* Stacked above the results, the rail is an accordion: each legend is a
     full tappable row, closed unless the group holds a tick (FilterRail.tsx),
     and the hairline between groups becomes the row's rule. */
  .tut-rail {
    position: static;
    gap: 0;
    border-bottom: 1px solid var(--hairline);
  }

  .tut-rail__group + .tut-rail__group {
    padding-top: 0;
  }

  .tut-rail__legend {
    float: left;                   /* a legend will not fill its fieldset's width otherwise */
    width: 100%;
    margin: 0;
  }

  .tut-rail__group::after {
    content: "";
    display: block;
    clear: both;
  }

  .tut-rail__toggle {
    padding: 12px 0;
    cursor: pointer;
    pointer-events: auto;
  }

  .tut-rail__chevron {
    display: block;
  }

  .tut-rail__option:last-of-type {
    margin-bottom: 10px;
  }

  .tut-clear {
    margin: 12px 0 16px;
  }
```

Keep the `.tut-hero__inner`, `.tut-body`, `.tut-featured*` rules in that block as they are.

- [ ] **Step 4: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean, warning count unchanged.

- [ ] **Step 5: Verify in the browser**

`http://localhost:3000/tutorials`:

| Width | Expect |
|---|---|
| 1440 | Rail on the left, legends as before, no chevrons, hovering a legend shows no pointer, every group open. |
| 768 | One column: hero, then rows Format / Level / Platform / Category / Published by, each closed with a chevron, then the featured tutorial and the grid. |
| 390 | Tap "Level" (`click`): three options appear, others stay closed. Tick "Beginner"; the grid filters. Reload: Level is open, the rest closed. |

`scrollWidth <= innerWidth` at 390: `true`.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/tutorials/FilterRail.tsx ui/src/tutorials.css
git commit -m "Collapse the tutorials rail into an accordion on narrow screens

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Community rail collapses on narrow screens

The same change as Task 5 for `CommunityRail` and `community.css`, repeated rather than shared (CLAUDE.md: the two rails are deliberate siblings). This is the third rail with the same toggle; note in the file header that it is the point at which a shared rail became reasonable, and leave the lift for a separate change.

**Files:**
- Modify: `ui/src/components/community/CommunityRail.tsx`
- Modify: `ui/src/community.css:1437-1461` (the 900px block) and after `.com-rail__legend` (line 520)

- [ ] **Step 1: Rewrite `CommunityRail.tsx`**

```tsx
/**
 * Faceted filters for the review feed.
 *
 * Deliberately a sibling of `tutorials/FilterRail`, not a reuse of it. Sharing
 * would mean parameterising that component's class prefix and its hardcoded
 * label, which is editing the tutorials screen to serve this one — the thing
 * CLAUDE.md warns against. Two pages with a checkbox list is a coincidence;
 * the honest moment to lift a shared rail is when a third one needs it.
 * (The responsive fold below is now the third copy of the same toggle, across
 * this file, FilterRail.tsx and catalog/FilterSidebar.tsx. That is the
 * moment. It is left for its own change rather than folded into a
 * responsiveness pass.)
 *
 * Counts are live: each says how many reviews that option would leave once the
 * *other* groups are applied, so a zero tells you the combination is empty
 * before you click it.
 *
 * Below 900px the rail stacks above the feed, so each group folds into a
 * heading row and starts closed unless it holds a ticked option. On desktop
 * every group is open and the heading is not a control: `.com-rail__toggle`
 * in community.css turns pointer events off there and hides the chevron.
 */

import React from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { useMediaQuery } from "../../hooks/useMediaQuery";

/** Where `.com-body` in community.css goes to one column. Keep them in step. */
const NARROW = "(max-width: 900px)";

export interface RailOption {
  value: string;
  label: string;
  count: number;
}

export interface RailGroup {
  key: string;
  legend: string;
  options: RailOption[];
}

interface CommunityRailProps {
  groups: RailGroup[];
  selected: Record<string, string[]>;
  onToggle: (groupKey: string, value: string) => void;
  onClear: () => void;
  hasFilters: boolean;
}

interface RailGroupViewProps {
  group: RailGroup;
  chosen: string[];
  onToggle: (value: string) => void;
}

const RailGroupView: React.FC<RailGroupViewProps> = ({ group, chosen, onToggle }) => {
  const isNarrow = useMediaQuery(NARROW);
  // `null` until the visitor toggles the group; the viewport decides before
  // then. Desktop is always open, whatever was chosen on a phone.
  const [choice, setChoice] = React.useState<boolean | null>(null);
  const isOpen = !isNarrow || (choice ?? chosen.length > 0);

  return (
    <fieldset className="com-rail__group">
      <legend className="com-rail__legend">
        <button
          type="button"
          className="com-rail__toggle"
          aria-expanded={isOpen}
          onClick={() => setChoice(!isOpen)}
        >
          {group.legend}
          <ExpandMoreIcon
            fontSize="small"
            className={`com-rail__chevron${isOpen ? " com-rail__chevron--open" : ""}`}
          />
        </button>
      </legend>

      {isOpen &&
        group.options.map((option) => {
          const isOn = chosen.includes(option.value);
          // Dimmed rather than disabled: an option already ticked has to stay
          // clickable so it can be unticked.
          const isEmpty = option.count === 0 && !isOn;

          return (
            <label
              key={option.value}
              className={
                isEmpty ? "com-rail__option com-rail__option--off" : "com-rail__option"
              }
            >
              <input
                type="checkbox"
                checked={isOn}
                onChange={() => onToggle(option.value)}
              />
              <span className="com-rail__label">{option.label}</span>
              <span className="com-rail__count">{option.count}</span>
            </label>
          );
        })}
    </fieldset>
  );
};

const CommunityRail: React.FC<CommunityRailProps> = ({
  groups,
  selected,
  onToggle,
  onClear,
  hasFilters,
}) => (
  <aside className="com-rail" aria-label="Filter reviews">
    {groups.map((group) => (
      <RailGroupView
        key={group.key}
        group={group}
        chosen={selected[group.key] || []}
        onToggle={(value) => onToggle(group.key, value)}
      />
    ))}

    {hasFilters && (
      <button type="button" className="com-clear" onClick={onClear}>
        Clear filters
      </button>
    )}
  </aside>
);

export default CommunityRail;
```

(`RailGroupView`, not `RailGroup`: this file already exports an interface named `RailGroup`.)

- [ ] **Step 2: Style the toggle at desktop in `community.css`**

After the `.com-rail__legend { ... }` rule (ends line 520), add:

```css
/* The legend's text is a button so the group can fold on narrow screens.
   On desktop it is inert: no pointer, no chevron, the same eyebrow as before.
   `font: inherit` and `color: inherit` because the eyebrow rule above sets
   them on the legend and a button resets both. */
.com-rail__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
  text-align: left;
  cursor: default;
  pointer-events: none;
}

.com-rail__chevron {
  display: none;
  flex: 0 0 auto;
  width: 16px !important;          /* MUI's `small` is 20px; too big for an 11px stamp */
  height: 16px !important;
  color: var(--muted);
  transition: transform 120ms ease;
}

.com-rail__chevron--open {
  transform: rotate(180deg);
}
```

- [ ] **Step 3: Replace the rail's 900px rules**

In the `@media (max-width: 900px)` block (lines 1437-1461), replace the `.com-rail { ... }` rule and the `.com-rail__group { min-width: 160px; }` rule (with its comment) with:

```css
  /* Stacked above the feed, the rail is an accordion: each legend is a full
     tappable row, closed unless the group holds a tick (CommunityRail.tsx),
     and the hairline between groups becomes the row's rule. */
  .com-rail {
    position: static;
    gap: 0;
    border-bottom: 1px solid var(--hairline);
  }

  .com-rail__group + .com-rail__group {
    padding-top: 0;
  }

  .com-rail__legend {
    float: left;                   /* a legend will not fill its fieldset's width otherwise */
    width: 100%;
    margin: 0;
  }

  .com-rail__group::after {
    content: "";
    display: block;
    clear: both;
  }

  .com-rail__toggle {
    padding: 12px 0;
    cursor: pointer;
    pointer-events: auto;
  }

  .com-rail__chevron {
    display: block;
  }

  .com-rail__option:last-of-type {
    margin-bottom: 10px;
  }

  .com-clear {
    margin: 12px 0 16px;
  }
```

Keep the `.com-hero__inner` and `.com-body` rules in that block.

- [ ] **Step 4: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean, warning count unchanged.

- [ ] **Step 5: Verify in the browser**

`http://localhost:3000/community` (needs at least one review in Supabase for the rail to render; if the feed is empty the rail is absent by design and `.com-body--norail` applies):

| Width | Expect |
|---|---|
| 1440 | Unchanged: rail left, legends, all open. |
| 768 | One column; hero, then Score / Tested on / On arrival rows closed, then the composer and feed. |
| 390 | Tap "Score": five rows appear. Tick one; feed filters; reload keeps Score open. The review form (the one in the user's screenshot) still lays out with "Tested on" above "Time in use" and the three arrival buttons wrapping onto two lines if needed, none clipped. |

`scrollWidth <= innerWidth` at 390: `true`.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/community/CommunityRail.tsx ui/src/community.css
git commit -m "Collapse the community rail into an accordion on narrow screens

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The assistant on a phone

`/assistant` drops the splash image below 820px and gives the chat the whole width. The catalogue's corner widget fills the screen under the navbar below 640px. `chatbox.css` is upstream and stays untouched: the override is scoped to a wrapper class on the assistant screen, and to `.chat-widget` in `catalog.css`.

**Files:**
- Modify: `ui/src/components/chatbox/AssistantScreen.tsx:22-31`
- Modify: `ui/src/index.css` (after `.product-image`)
- Modify: `ui/src/catalog.css:670-672` (the widget's 820px rule)

- [ ] **Step 1: Wrap the assistant screen**

In `ui/src/components/chatbox/AssistantScreen.tsx` replace the `AssistantScreen` component (lines 22-31) with:

```tsx
/* The wrapper class is what index.css hangs the phone layout on: it hides the
   image and widens the chat without a rule in chatbox.css, which is upstream
   styling the catalogue's corner widget also depends on. */
const AssistantScreen: React.FC = () => (
  <div className="assistant-screen">
    <Apparel />
    {/* A null fallback, not a second <Chatbox />: two instances would each
        play the intro, and the first would be thrown away mid-sentence. */}
    <Suspense fallback={null}>
      <AssistantWithQuery />
    </Suspense>
  </div>
);
```

- [ ] **Step 2: Add the phone rule to `index.css`**

After the `.product-image { ... }` rule add:

```css
/* Below 820px the assistant is the whole screen. The image is decoration and
   goes; the fixed chat panel, 60vw on desktop, takes the full width. The
   selector is two classes deep on purpose: index.css loads before
   chatbox.css, so a bare `.chatbox` here would lose on source order. */
@media (max-width: 820px) {
  .assistant-screen .product-pane {
    display: none;
  }

  .assistant-screen .chatbox {
    left: 0;
    width: auto;
  }
}
```

- [ ] **Step 3: Make the catalogue widget full-screen on phones**

In `ui/src/catalog.css` replace

```css
@media (max-width: 820px) {
  .chat-widget { width: calc(100vw - 32px); right: 16px; }
}
```

with

```css
@media (max-width: 820px) {
  .chat-widget { width: calc(100vw - 32px); right: 16px; }
}

/* On a phone the panel is the screen: it fills the band under the navbar and
   the launcher, which stays on top of it, is the way out. The launcher clears
   the home indicator on phones that have one. */
@media (max-width: 640px) {
  .chat-widget {
    inset: var(--nav-h) 0 0 0;
    width: auto;
    height: auto;
    transform: translateY(0);
  }

  .chat-widget .chatbox {
    border-radius: 0;
    box-shadow: none;
    border-top: 1px solid var(--v-hairline);
  }

  .chat-launcher {
    right: 16px;
    bottom: calc(16px + env(safe-area-inset-bottom));
  }
}
```

- [ ] **Step 4: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 5: Verify in the browser**

| Route | Width | Expect |
|---|---|---|
| `/assistant` | 1440 | Image left 40vw, chat right 60vw, unchanged. |
| `/assistant` | 768 | No image; the chat panel spans the full width from under the two-row navbar to the bottom; the input is reachable. |
| `/assistant` | 390 | Same; a message wraps inside the panel; nothing scrolls sideways. |
| `/catalog` | 390 | Tap "Ask the advisor": the panel covers the page under the navbar; the launcher reads "Close" on top of it; tapping it closes the panel. |

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/chatbox/AssistantScreen.tsx ui/src/index.css ui/src/catalog.css
git commit -m "Give the assistant the whole screen on phones

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The sweep

Every route at every width, with the pass criteria from the spec. Findings become rules in that page's own CSS file with a comment saying why, in the style of the existing breakpoint blocks. This task cannot list its fixes in advance; it lists exactly what to look for and where a fix goes.

**Files:**
- Possibly modify: `ui/src/landing.css`, `ui/src/tutorials.css`, `ui/src/community.css`, `ui/src/catalog.css`, `ui/src/auth.css`, `ui/src/chatbox.css` only through the `.assistant-screen` / `.chat-widget` scopes above

- [ ] **Step 1: Run the matrix**

For each of `/`, `/catalog/sensors`, `/tutorials`, `/community`, `/assistant`, `/auth/login`, `/auth/sign-up`, and each of 360×740, 390×844, 768×1024, 1024×768, 1280×800: `resize_page`, `take_screenshot`, and `evaluate_script`:

```js
(() => {
  const wide = document.documentElement.scrollWidth > window.innerWidth;
  const off = [...document.querySelectorAll('a, button, input, select, textarea')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1); })
    .map(el => el.className || el.tagName);
  return { wide, off };
})()
```

`wide` must be `false`. `off` must be empty except for links inside `.nav-bar__categories` (the strip scrolls on purpose) and, on `/`, anything inside the landing page's own horizontal store strip if it scrolls by design. Save each screenshot's path in a table in this section as you go, one row per route and width, with "ok" or the finding.

- [ ] **Step 2: Look at each screenshot for what the script cannot see**

Text drawn over other text; a heading cut off; a card image squashed; a form field narrower than its label; a button whose label wraps inside itself; a section whose side padding is not 16px on phones (DESIGN.md: 16px gutter). Specific places to look because their desktop values are large:

- `/`: `.landing .hero__copy` (absolutely placed at `top: 7%`), the four-up `.numbers` (already 2-up below 1024; check the `clamp(40px, 4.5vw, 64px)` figures at 360), `.stores` strip, `.outcome` band at `70vh`, the giant `.foot__tag` wordmark at the bottom.
- `/tutorials`: `.tut-featured` at 390, the `.tut-hero` search field and its button on one line.
- `/community`: the review form's `.com-bench__grid` (already one column at 640), `.com-ratinginput__seg` (30px at 640), the three "On arrival" buttons, the review cards' product row.
- `/catalog/sensors`: pagination with nine buttons at 360 (`.catalog__pagination` should wrap; if not, add `flex-wrap: wrap; row-gap: 8px`), the sort select beside "Showing 1 – 24 of 412 products" at 360 (if they collide, `.catalog__resultbar { flex-wrap: wrap; }`).
- `/auth/login`: the card at 360 has 16px gutters (already `padding: 24px 16px`), the fields fill the card.

- [ ] **Step 3: Fix each finding in its page's file**

Add rules inside the page's existing `@media` block for the nearest width (create a `@media (max-width: 400px)` block only if something breaks between 360 and 390 and nowhere else). Each rule carries a one-line comment saying what it prevents, e.g.

```css
  /* Nine page buttons do not fit 360px on one line; wrapping beats a
     scrolling pagination nobody would find. */
  .catalog__pagination { flex-wrap: wrap; row-gap: 8px; }
```

Re-run Step 1 for that route after each fix.

- [ ] **Step 4: Final checks**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean; lint warning count equal to the count before Task 1.

Open `/catalog` at 390 with DevTools' console (`list_console_messages`): no errors or warnings from our code (hydration warnings would show here if anything read the viewport during render).

- [ ] **Step 5: Record the token in DESIGN.md**

In `DESIGN.md` under "Responsive gotchas" (line 472), after the two numbered rules, add:

```markdown
3. The navbar's height is `--nav-h` on `:root` (64px, 104px below 1120px
   where the bar is two rows) and the band under it is `--page-h`. A page
   that fills the viewport sets `height: var(--page-h)`; nothing subtracts
   `64px` by hand any more.
4. The filter rails fold into an accordion where their page goes to one
   column (820px on the catalogue, 900px on tutorials and community). Each
   rail's `NARROW` constant and its CSS breakpoint must match.
```

And in `CLAUDE.md`, in the "Things that are easy to break" list, add after the "Every page is statically prerendered" bullet:

```markdown
- **Viewport-dependent rendering goes through `useMediaQuery`**
  (`ui/src/hooks/useMediaQuery.ts`), whose server snapshot is `false`. The
  three filter rails use it to start closed on narrow screens. The navbar's
  height is a token, `--nav-h` in `index.css`; do not write `64px` into a
  page again. Breakpoints and what each one does are in
  [docs/superpowers/specs/2026-09-19-responsive-layout-design.md](docs/superpowers/specs/2026-09-19-responsive-layout-design.md).
```

- [ ] **Step 6: Commit**

```bash
git add ui/src DESIGN.md CLAUDE.md
git commit -m "Finish the responsive sweep and record the navbar token

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** Range and breakpoints: Tasks 1, 2 (1280, 1120, 640), 4 (820), 5 and 6 (900). Two-row navbar with account at the strip's end and name hidden below 640: Task 2. `--nav-h` in seven places plus `dvh`: Task 1. Accordion rails, chosen groups open, desktop unchanged, three siblings not shared, `matchMedia` outside render: Tasks 3-6. `/assistant` and the corner widget: Task 7. Sweep and documentation: Task 8. Out-of-scope items are not touched.

**Placeholders.** Task 8 Step 3 cannot list fixes it has not found; it gives the exact selector-and-comment form a fix must take and two concrete examples for the two most likely findings. Everything else is literal code.

**Consistency.** `useMediaQuery(query: string): boolean` is used identically in Tasks 4, 5, 6. The `NARROW` constants match the CSS breakpoints in the same task (820 catalogue, 900 tutorials and community). Class names: `.nav-bar__brand/__categories/__editorial/__account/__name` appear in Task 2's TSX and CSS alike; `.tut-rail__toggle/__chevron/__chevron--open` and `.com-rail__toggle/__chevron/__chevron--open` likewise. `RailGroupView` in Task 6 avoids the clash with the exported `RailGroup` interface. `.assistant-screen` is set in Task 7's TSX and read in its CSS. `--page-h` and `--nav-h` are declared in Task 1 before any later task reads them.
