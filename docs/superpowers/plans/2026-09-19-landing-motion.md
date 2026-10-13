# Landing Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make three landing bands move the way the spec says: numbers count up centred, the showcase holds four seconds and only pauses over its tabs, the outcome band plays once on entry instead of following the scroll.

**Architecture:** All three bands already reveal through an `IntersectionObserver`. The count-up is a pure function (`countAt`) tested under vitest plus a small `requestAnimationFrame` hook in `Numbers.tsx`; the showcase is CSS values and one selector; the outcome band drops its scroll listener for `useReveal` and lets CSS transitions do the drawing, with each outline's length passed as a `--len` custom property so no JavaScript runs per frame.

**Tech Stack:** Next.js 16, React 19, TypeScript, plain CSS in `ui/src/landing.css`, vitest (node environment, `src/**/*.test.ts`).

**Spec:** [docs/superpowers/specs/2026-09-19-landing-motion-design.md](../specs/2026-09-19-landing-motion-design.md)

**Working directory for every command:** `ui/` (that is, `cd ui` first). Git commands run from the repository root.

---

## File map

| File | Responsibility |
|---|---|
| `ui/src/components/landing/countUp.ts` (new) | Pure maths: `easeOutCubic`, `countAt`. No DOM, so vitest can run it. |
| `ui/src/components/landing/countUp.test.ts` (new) | Its tests. |
| `ui/src/components/landing/useReveal.ts` | Returns `[ref, inView]` instead of `ref`. |
| `ui/src/components/landing/StoreStrip.tsx` | Caller of `useReveal`: destructures `[ref]`. |
| `ui/src/components/landing/Numbers.tsx` | `useCountUp` hook, staggered delays, centred cells. |
| `ui/src/components/landing/Showcase.tsx` | Header comment: six seconds becomes four, hover pause is the tab row. |
| `ui/src/components/landing/OutcomeBand.tsx` | No scroll listener; `useReveal(0.35)`; `--len` per outline; fills inside clipped groups. |
| `ui/src/landing.css` | Numbers width, alignment, caption fade; showcase hold, track, pause selector, crossfade; outcome transitions; reduced-motion additions. |
| `docs/superpowers/specs/2026-09-19-landing-page-design.md` | Bands 3, 4, 5 point at the motion spec. |

---

### Task 1: The count-up maths, tested

**Files:**
- Create: `ui/src/components/landing/countUp.ts`
- Create: `ui/src/components/landing/countUp.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// ui/src/components/landing/countUp.test.ts
import { describe, expect, it } from "vitest";
import { countAt, easeOutCubic } from "./countUp";

describe("easeOutCubic", () => {
  it("starts at 0 and ends at 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
  it("is past halfway at t = 0.5, so the count starts fast and settles", () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
  });
});

describe("countAt", () => {
  const delay = 120;
  const duration = 1200;

  it("shows the starting value until the delay has passed", () => {
    expect(countAt(0, 2880, 0, delay, duration)).toBe(0);
    expect(countAt(0, 2880, 119, delay, duration)).toBe(0);
  });
  it("shows the target once the count is over", () => {
    expect(countAt(0, 2880, delay + duration, delay, duration)).toBe(2880);
    expect(countAt(0, 2880, 10_000, delay, duration)).toBe(2880);
  });
  it("is an eased fraction of the way in between", () => {
    // Halfway through the duration, eased: 0.875 of 2880 = 2520.
    expect(countAt(0, 2880, delay + duration / 2, delay, duration)).toBe(2520);
  });
  it("counts from a non-zero start, up or down", () => {
    expect(countAt(2880, 2900, delay + duration, delay, duration)).toBe(2900);
    expect(countAt(2900, 2880, delay + duration, delay, duration)).toBe(2880);
    expect(countAt(100, 200, delay + duration / 2, delay, duration)).toBe(188);
  });
  it("returns whole numbers", () => {
    for (let ms = 0; ms <= delay + duration; ms += 37) {
      expect(Number.isInteger(countAt(0, 13, ms, delay, duration))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ui && npx vitest run src/components/landing/countUp.test.ts`
Expected: FAIL, "Failed to resolve import "./countUp"".

- [ ] **Step 3: Write the implementation**

```ts
// ui/src/components/landing/countUp.ts
/**
 * The maths behind the numbers band's count-up, kept pure so vitest can run
 * it (the config is node-only, no DOM). The hook in Numbers.tsx calls
 * `countAt` once per animation frame.
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Fast start, soft landing: 1 - (1 - t)^3. */
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * The whole number to show `elapsed` ms into a count that waits `delay` ms,
 * then runs from `from` to `to` over `duration` ms. Before the delay it is
 * `from`; after delay + duration it is `to`.
 */
export function countAt(
  from: number,
  to: number,
  elapsed: number,
  delay: number,
  duration: number,
): number {
  const t = clamp((elapsed - delay) / duration, 0, 1);
  return Math.round(from + (to - from) * easeOutCubic(t));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ui && npx vitest run src/components/landing/countUp.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/landing/countUp.ts ui/src/components/landing/countUp.test.ts
git commit -m "Landing: count-up maths for the numbers band"
```

---

### Task 2: `useReveal` reports whether it has fired

**Files:**
- Modify: `ui/src/components/landing/useReveal.ts`
- Modify: `ui/src/components/landing/StoreStrip.tsx:20`
- Modify: `ui/src/components/landing/Numbers.tsx:17`

No unit test: the hook needs `IntersectionObserver`, and the vitest config is node-only by design (see `ui/vitest.config.ts`). The type check is the test here.

- [ ] **Step 1: Return a tuple from the hook**

Replace the whole of `ui/src/components/landing/useReveal.ts` with:

```ts
/**
 * Adds `is-in` to an element the first time it scrolls into view, and says
 * so. The CSS does the rest: `.reveal` starts faded and 14px low,
 * `.reveal.is-in` transitions to rest. One observer per element,
 * disconnected once fired, so a band that has played never plays again on
 * the way back up.
 *
 * Returns `[ref, inView]`. Most bands only need the ref; the numbers band
 * reads `inView` to start counting, and the outcome band to start drawing.
 *
 * Runs only in an effect: the page is prerendered, and the first render must
 * not touch `window`.
 */

import { RefObject, useEffect, useRef, useState } from "react";

export function useReveal<T extends HTMLElement>(
  threshold = 0.2,
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fire = () => {
      el.classList.add("is-in");
      setInView(true);
    };
    if (typeof IntersectionObserver === "undefined") {
      fire();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fire();
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, inView];
}
```

- [ ] **Step 2: Update the two callers**

In `ui/src/components/landing/StoreStrip.tsx`, change line 20:

```ts
  const [ref] = useReveal<HTMLElement>();
```

In `ui/src/components/landing/Numbers.tsx`, change line 17:

```ts
  const [ref] = useReveal<HTMLElement>();
```

(Task 3 rewrites `Numbers.tsx` fully; this keeps the type check green in between.)

- [ ] **Step 3: Type check**

Run: `cd ui && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/landing/useReveal.ts ui/src/components/landing/StoreStrip.tsx ui/src/components/landing/Numbers.tsx
git commit -m "Landing: useReveal returns whether it has fired"
```

---

### Task 3: Numbers count up, centred

**Files:**
- Modify: `ui/src/components/landing/Numbers.tsx`
- Modify: `ui/src/landing.css:371-388` (the NUMBERS block) and the reduced-motion block at `:139-142`

- [ ] **Step 1: Rewrite `Numbers.tsx`**

Replace the whole file with:

```tsx
"use client";

/**
 * Four figures, no headline. Every one is fetched (see useLandingStats), so
 * the band cannot claim a number the catalogue does not hold. A dash means
 * the server has not answered yet, not zero.
 *
 * Once the band scrolls into view each figure counts up from 0 over 1.2s,
 * one starting 120ms after the last, left to right. The count always runs
 * from the value on screen to the new target, so a figure that arrives late
 * counts up then, and a refetch moves from the old value rather than
 * restarting. Reduced motion shows the target at once.
 */

import React, { useEffect, useRef, useState } from "react";
import { LandingStats } from "../../hooks/useLandingStats";
import { countAt } from "./countUp";
import { useReveal } from "./useReveal";

const DURATION = 1200;
const STAGGER = 120;

function useCountUp(target: number | null, delay: number, active: boolean): number | null {
  const [shown, setShown] = useState<number | null>(null);
  // The last value painted, so a new target counts on from it.
  const shownRef = useRef(0);

  useEffect(() => {
    if (!active || target === null) return;
    const reduce =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Under reduced motion the count starts at its end, so the first frame
    // already shows the target. Still a frame, so no setState runs inside
    // the effect body itself.
    const from = reduce ? target : shownRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const v = countAt(from, target, elapsed, delay, DURATION);
      shownRef.current = v;
      setShown(v);
      if (elapsed < delay + DURATION) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, delay, active]);

  // Null until the server answers; 0 for the frame before the count starts.
  return target === null ? null : (shown ?? 0);
}

const figure = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-US");

const Figure: React.FC<{ target: number | null; delay: number; active: boolean; label: string }> = ({
  target,
  delay,
  active,
  label,
}) => {
  const shown = useCountUp(target, delay, active);
  return (
    <div className="numbers__item">
      <div className="numbers__value">{figure(shown)}</div>
      <div className="eyebrow eyebrow--muted">{label}</div>
    </div>
  );
};

const Numbers: React.FC<{ stats: LandingStats }> = ({ stats }) => {
  const [ref, inView] = useReveal<HTMLElement>();
  const items: { target: number | null; label: string }[] = [
    { target: stats.robots, label: "robots and parts" },
    // "Uncategorised" is a bucket, not a category, so it is not counted.
    {
      target: stats.categories
        ? stats.categories.filter((f) => f.value !== "Uncategorised").length
        : null,
      label: "categories",
    },
    { target: stats.tutorials, label: "tutorials" },
    { target: stats.stores, label: "stores, one price axis" },
  ];
  return (
    <section className="numbers wrap reveal" ref={ref} aria-label="Coverage">
      {items.map((item, i) => (
        <Figure key={item.label} {...item} delay={i * STAGGER} active={inView} />
      ))}
    </section>
  );
};

export default Numbers;
```

- [ ] **Step 2: Centre the band and fade the captions in CSS**

In `ui/src/landing.css`, replace the NUMBERS block (lines 371 to 388, from `/* ---------- NUMBERS ---------- */` through `.landing .numbers .eyebrow { margin: 10px 0 0; }`) with:

```css
/* ---------- NUMBERS ---------- */

/* Narrower than the wrap and centred, so the four figures sit in the middle
   of the page rather than at its edges. The figures count up in
   Numbers.tsx; the captions fade in here, each a beat after its figure
   starts (the 0.3s head start is the band's own reveal). */
.landing .numbers {
  padding-top: var(--l-gap);
  padding-bottom: var(--l-gap);
  max-width: 1040px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  text-align: center;
}
.landing .numbers__value {
  font-family: var(--l-mono);
  font-variant-numeric: tabular-nums;
  font-size: clamp(40px, 4.5vw, 64px);
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--l-ink);
}
.landing .numbers .eyebrow {
  margin: 10px 0 0;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.5s ease, transform 0.5s ease;
}
.landing .numbers__item:nth-child(1) .eyebrow { transition-delay: 0.3s; }
.landing .numbers__item:nth-child(2) .eyebrow { transition-delay: 0.42s; }
.landing .numbers__item:nth-child(3) .eyebrow { transition-delay: 0.54s; }
.landing .numbers__item:nth-child(4) .eyebrow { transition-delay: 0.66s; }
.landing .numbers.is-in .eyebrow {
  opacity: 1;
  transform: none;
}
```

Then extend the reduced-motion block near the top of the file (lines 139 to 142) so it reads:

```css
@media (prefers-reduced-motion: reduce) {
  .landing { scroll-behavior: auto; }
  .landing .reveal { opacity: 1; transform: none; transition: none; }
  .landing .numbers .eyebrow { opacity: 1; transform: none; transition: none; }
}
```

- [ ] **Step 3: Type check and lint**

Run: `cd ui && npx tsc --noEmit && npm run lint`
Expected: tsc prints nothing; lint reports no errors and adds no new warnings under `src/components/landing/`. (The ~40 pre-existing warnings are all in the upstream chat code.)

- [ ] **Step 4: Look at it**

With the mock server on 8009 and the dev server on 3000 (the user runs both; do not start a second dev server), open `http://localhost:3000/` at 1440 wide and scroll to the numbers.
Expected: the four figures are centred in the page and count from 0 to their values one after another; the captions fade in beneath them; scrolling away and back does not replay. Nothing in the browser console.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/landing/Numbers.tsx ui/src/landing.css
git commit -m "Landing: numbers count up, centred"
```

---

### Task 4: Showcase holds four seconds and pauses only over the tabs

**Files:**
- Modify: `ui/src/landing.css:390-535` (the SHOWCASE block)
- Modify: `ui/src/components/landing/Showcase.tsx:3-16` (the header comment)

- [ ] **Step 1: CSS values**

In `ui/src/landing.css`, make these edits inside the SHOWCASE block.

The intro comment and hold (lines 392 to 405):

```css
/* Four photographs stacked in one full-bleed band; the second place the
   design system's no-photography rule is set aside, for the same reason as
   the hero. The active tab's underline is the clock: a 4s fill whose
   `animationend` advances the slide (Showcase.tsx). Everything that moves
   here obeys one play-state rule, so pausing the bar pauses the drift. */
.landing .showcase {
  --sc-hold: 4s;
  position: relative;
  height: min(80vh, 760px);
  min-height: 520px;
  overflow: hidden;
  background: var(--l-ink);
  color: #ffffff;
}
```

The crossfade (lines 406 to 418):

```css
.landing .showcase__slide {
  position: absolute;
  inset: 0;
  opacity: 0;
  /* The outgoing slide drops out only after the incoming one has fully
     faded in on top of it, so there is never a dip to the dark canvas. */
  transition: opacity 0s 0.6s;
}
.landing .showcase__slide.is-active {
  opacity: 1;
  z-index: 1;
  transition: opacity 0.6s ease;
}
```

The track (lines 495 to 503):

```css
.landing .showcase__track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.3);
  overflow: hidden;
}
```

The pause rule (lines 518 to 528):

```css
/* One play-state rule. Running only while the band is on screen and not
   under a mouse on the tab row or holding keyboard focus. The hover pause is
   the tabs, not the whole band: a reader parking the cursor on the
   photograph must not stop the tour. `:has(:focus-visible)` rather than
   `:focus-within`, so a click on a tab does not freeze it. */
.landing .showcase.is-live .showcase__bar { animation-play-state: running; }
.landing .showcase:not(.is-live) .showcase__photo { animation-play-state: paused; }
@media (hover: hover) {
  .landing .showcase:has(.showcase__tabs:hover) .showcase__bar,
  .landing .showcase:has(.showcase__tabs:hover) .showcase__photo { animation-play-state: paused; }
}
.landing .showcase:has(:focus-visible) .showcase__bar,
.landing .showcase:has(:focus-visible) .showcase__photo { animation-play-state: paused; }
```

- [ ] **Step 2: Update the component's header comment**

In `ui/src/components/landing/Showcase.tsx`, change lines 5 to 7 and 13 to 16 so the comment reads:

```tsx
/**
 * The feature showcase: one full-bleed photograph at a time, one claim over
 * it, and four tabs along the bottom edge. The active tab's underline fills
 * over four seconds; when it is full the next slide fades in over the last
 * and its tab starts filling. This is General Robotics' industry rail
 * (Warehouse, Government, Manufacturing, Energy) turned into a tour of what
 * Servo does.
 *
 * The clock is the underline itself. It is a CSS animation, and the slide
 * advances on its `animationend`, so the bar and the picture can never fall
 * out of step and there is no interval to clear. Pausing is a matter of
 * `animation-play-state`: the section pauses while it is off screen, while
 * the mouse is over the tab row, or while it holds keyboard focus, and the
 * photograph's slow drift pauses with it because it obeys the same rule.
 *
```

The rest of the comment (the photographs paragraph) is unchanged.

- [ ] **Step 3: Look at it**

Open `http://localhost:3000/`, scroll to the showcase, park the mouse on the photograph.
Expected: the 3px underline fills over four seconds and the slide changes; it keeps cycling with the mouse on the picture. Move the mouse onto the tab row: the fill stops. Move it off: it resumes.

- [ ] **Step 4: Commit**

```bash
git add ui/src/landing.css ui/src/components/landing/Showcase.tsx
git commit -m "Landing: showcase holds four seconds, pauses only over the tabs"
```

---

### Task 5: Outcome band plays once on entry

**Files:**
- Modify: `ui/src/components/landing/OutcomeBand.tsx` (whole file)
- Modify: `ui/src/landing.css:285-369` (the OUTCOME BAND block)

- [ ] **Step 1: Rewrite `OutcomeBand.tsx`**

Replace the whole file with:

```tsx
"use client";

/**
 * The "Choose robots faster" band: one centred outcome on a band one tone
 * below the canvas, with rounded blocks that draw themselves once the band
 * scrolls into view. This is General Robotics' "Deploy robots faster"
 * section, rebuilt in SVG so it ships as markup rather than a Lottie file.
 *
 * It plays once, on entry, over about 1.8s, and never depends on where the
 * scroll stops (an earlier version was scrubbed by scroll position and
 * would freeze half-drawn). `useReveal` adds `is-in` at 35% visible and the
 * stylesheet does the rest with transitions:
 *
 *   - outlines and hairlines draw, via `stroke-dashoffset`, over the first second;
 *   - fills rise from the bottom, a `translateY` inside a clipped group, from 0.6s;
 *   - the copy fades up on its existing delays;
 *   - then a short white dash loops the tall block: the "signal", the one
 *     thing that keeps moving after the picture is finished.
 *
 * Each outline carries its own path length as `--len`, which is both its
 * dasharray and its starting offset, so "hidden" means "offset by exactly
 * its length" and the transition to 0 draws it end to end.
 */

import React from "react";
import Link from "next/link";

import { useReveal } from "./useReveal";

/** `--len` as an inline style; React passes custom properties through untouched. */
const len = (n: number) => ({ "--len": String(n) }) as React.CSSProperties;

const OutcomeBand: React.FC = () => {
  const [ref] = useReveal<HTMLElement>(0.35);

  return (
    <section className="outcome" ref={ref} aria-labelledby="outcome-title">
      <svg
        className="outcome__art"
        viewBox="0 0 1440 720"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          {/* Each clip is its block's own rounded rect, so the fill can rise
              inside it without showing square corners on the way up. */}
          <clipPath id="outcome-clip-a">
            <rect x="24" y="-40" width="290" height="600" rx="40" />
          </clipPath>
          <clipPath id="outcome-clip-b">
            <rect x="1140" y="440" width="300" height="320" rx="40" />
          </clipPath>
        </defs>

        {/* two hairlines that extend across the band */}
        <line className="outcome__hair" x1="0" y1="280" x2="1440" y2="280" />
        <line className="outcome__hair" x1="1440" y1="600" x2="0" y2="600" />

        {/* tall block, top left: outline draws, then the fill rises */}
        <rect className="outcome__draw" style={len(1760)} x="24" y="-40" width="290" height="600" rx="40" />
        <g clipPath="url(#outcome-clip-a)">
          <rect className="outcome__fill" x="24" y="-40" width="290" height="600" rx="40" />
        </g>

        {/* wide block, bottom right */}
        <rect className="outcome__draw" style={len(1240)} x="1140" y="440" width="300" height="320" rx="40" />
        <g clipPath="url(#outcome-clip-b)">
          <rect className="outcome__fill" x="1140" y="440" width="300" height="320" rx="40" />
        </g>

        {/* a trace down and out of the wide block, and a small outlined block hanging off it */}
        <path
          className="outcome__draw"
          style={len(1400)}
          d="M1140 600 H1000 Q960 600 960 640 V760 M1140 600 H1180 Q1200 600 1200 620 V760"
        />
        <rect className="outcome__draw" style={len(900)} x="960" y="620" width="220" height="200" rx="34" />

        {/* the signal that runs the tall block once it is drawn */}
        <rect className="outcome__signal" x="24" y="-40" width="290" height="600" rx="40" />
      </svg>

      <div className="outcome__copy">
        <p className="eyebrow">One search, every store</p>
        <h2 id="outcome-title" className="display">
          Choose robots faster
        </h2>
        <p className="lead">
          Specs, prices and tutorials from every Pakistani robotics store,
          compared before you spend a rupee.
        </p>
        <Link href="/catalog" className="pill pill--ink">
          See how it works
        </Link>
      </div>
    </section>
  );
};

export default OutcomeBand;
```

Note the fill rects sit inside a `<g clipPath>` rather than carrying `clipPath` themselves. In SVG a clip path is applied in the referencing element's own coordinate system, so a clip on the transformed rect would move with it and clip nothing.

- [ ] **Step 2: CSS transitions**

In `ui/src/landing.css`, replace lines 287 to 334 (from the comment `/* One tone below the canvas ...` through the closing brace of `@keyframes outcome-run`) with:

```css
/* One tone below the canvas, as their band is. Everything plays from
   `.outcome.is-in`, which OutcomeBand.tsx sets once through useReveal. Each
   outline's `--len` is its own path length: dasharray and starting offset
   both, so the transition to 0 draws the whole shape and nothing more. */
.landing .outcome {
  position: relative;
  height: 92vh;
  min-height: 620px;
  max-height: 860px;
  background: var(--l-band);
  overflow: hidden;
}
.landing .outcome__art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.landing .outcome__draw {
  fill: none;
  stroke: var(--l-ink);
  stroke-width: 1.5;
  stroke-dasharray: var(--len);
  stroke-dashoffset: var(--len);
  transition: stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1);
}
.landing .outcome__hair {
  fill: none;
  stroke: var(--l-ash);
  stroke-width: 1;
  stroke-dasharray: 1440;
  stroke-dashoffset: 1440;
  transition: stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}
.landing .outcome.is-in .outcome__draw,
.landing .outcome.is-in .outcome__hair { stroke-dashoffset: 0; }

/* The fill starts one block-height below itself, hidden by the clipped
   group around it, and rises once the outline is most of the way drawn. */
.landing .outcome__fill {
  fill: var(--l-ink);
  transform-box: fill-box;
  transform: translateY(100%);
  transition: transform 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.6s;
}
.landing .outcome.is-in .outcome__fill { transform: none; }

.landing .outcome__signal {
  fill: none;
  stroke: #ffffff;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-dasharray: 22 1400;
  animation: outcome-run 5s linear infinite;
  opacity: 0;
  /* After the fill has landed. */
  transition: opacity 0.6s ease 1.6s;
}
.landing .outcome.is-in .outcome__signal { opacity: 1; }
@keyframes outcome-run {
  from { stroke-dashoffset: 1422; }
  to { stroke-dashoffset: 0; }
}
```

Then extend the outcome reduced-motion block (which after the edit above starts at the line `@media (prefers-reduced-motion: reduce) {` just below the `.outcome.is-in .outcome__copy > *` rule) so it reads:

```css
@media (prefers-reduced-motion: reduce) {
  .landing .outcome__draw,
  .landing .outcome__hair { stroke-dashoffset: 0 !important; }
  .landing .outcome__fill { transform: none; transition: none; }
  .landing .outcome__signal { animation: none; }
  .landing .outcome__copy > * { opacity: 1; transform: none; transition: none; }
}
```

The `.outcome__copy` rules between those two blocks are unchanged.

- [ ] **Step 3: Type check and lint**

Run: `cd ui && npx tsc --noEmit && npm run lint`
Expected: tsc prints nothing; no lint errors, no new warnings.

- [ ] **Step 4: Look at it**

Open `http://localhost:3000/`, scroll until the outcome band is about a third on screen, and stop.
Expected: the hairlines and outlines draw over about a second, both black fills rise into their outlines with rounded corners intact, the copy fades up, then a white dash starts circling the tall block. Nothing is left half-filled. Scroll away and back: it stays finished. Under DevTools > Rendering > "Emulate CSS media feature prefers-reduced-motion: reduce", reload: everything is at rest, no dash moving.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/landing/OutcomeBand.tsx ui/src/landing.css
git commit -m "Landing: outcome band plays once on entry"
```

---

### Task 6: Point the landing spec here, then the full check

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-landing-page-design.md:46-50`

- [ ] **Step 1: Cross-reference the motion spec**

In `docs/superpowers/specs/2026-09-19-landing-page-design.md`, change items 3, 4 and 5 (lines 46 to 50) to:

```markdown
3. **Outcome band** on `#ebebeb`: eyebrow `ONE SEARCH, EVERY STORE`, "Choose robots faster", one line, a black pill to `/catalog`, the drawn shapes. Motion revised in [2026-09-19-landing-motion-design.md](2026-09-19-landing-motion-design.md): it plays once on entry, not on scroll position.
4. **Numbers.** Four mono figures with mono captions: robots and parts, categories, tutorials, stores. No headline. Centred and counting up since the motion revision.
5. **Showcase** (revised 2026-09-19, replacing the Modules, Categories, Who-it's-for and Closing bands). One full-bleed photograph at a time with one claim over it, and four tabs along the bottom edge: **Robots · Compare · Tutorials · Community**. The active tab's underline fills over four seconds (six until the motion revision); when it is full the next photograph fades in over the last. General Robotics' industry rail (Warehouse, Government, Manufacturing, Energy) turned into a tour of what Servo does.
   - The underline is the clock: a CSS `scaleX` animation whose `animationend` advances the slide, so bar and picture cannot drift apart and there is no interval. Clicking a tab jumps to it. The tour pauses while the band is off screen, while the mouse is over the tab row (not the whole band), or while it holds keyboard focus (`:has(:focus-visible)`, so a click does not freeze it), via one `animation-play-state` rule.
   - The "video" is a 5.5s push-in (`scale 1.02 → 1.1` with a small pan) on the active photograph. Real video was considered and set aside: image-to-video generation bills per still and ships a 4x heavier page for the same effect. `prefers-reduced-motion` drops the drift and the crossfade; the bar still fills.
```

- [ ] **Step 2: Run everything**

Run: `cd ui && npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: vitest passes (the existing assistant tests plus the 7 new ones); tsc silent; lint with no errors; build completes with every route prerendered and no warnings about `window` or hydration.

- [ ] **Step 3: Walk the spec's test list**

On `http://localhost:3000/` at 1440 wide with the mock server running:

1. Numbers: four figures count up once, left to right, centred. Scroll away and back: no replay.
2. Showcase: with the mouse on the photograph, the underline fills over four seconds and the slide advances. On the tabs, it pauses.
3. Outcome band: scroll to a third visible and stop: outlines draw, fills rise, copy appears, signal loops, nothing half-filled.
4. With reduced motion emulated: every band at its final state, no motion.

Browser console clean throughout.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-19-landing-page-design.md docs/superpowers/plans/2026-09-19-landing-motion.md
git commit -m "Landing: record the motion revision in the page spec"
```
