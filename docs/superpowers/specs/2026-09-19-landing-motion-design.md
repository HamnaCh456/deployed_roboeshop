# Landing page motion, second pass

**Date:** 2026-09-19
**Status:** approved
**Revises:** [2026-09-19-landing-page-design.md](2026-09-19-landing-page-design.md), bands 3, 4 and 5

## Why

Three bands on the landing page move, and each was found wanting on a
1440px screen:

- **Numbers** stretch edge to edge, left-aligned in their cells, and the
  band fades up as one block. Nothing about the figures themselves moves,
  so the reveal reads as a layout shift rather than as numbers appearing.
- **Showcase** holds each slide for six seconds and pauses whenever the
  mouse is anywhere over the band. A reader who parks the cursor on the
  photograph sees the tour stop, and the 2px underline that is meant to
  show progress is easy to miss. The effect is "slow" or "stuck".
- **Outcome band** is scrubbed by scroll position. Stop scrolling halfway
  and the blocks freeze half-filled with a flat cut edge. The screenshot
  that prompted this had the wide block cut off at its middle.

## Numbers

**Layout.** The grid gains `max-width: 1040px; margin: 0 auto` inside the
existing `.wrap`, and each cell is `text-align: center`. At the phone
breakpoint the existing two-column grid stands.

**Motion.** The band still reveals once through `useReveal`. When `is-in`
lands, each figure counts from 0 to its value over 1.2s on an ease-out
curve (`1 - (1 - t)^3`), figure `i` starting `i * 120ms` after the first.
The caption under each figure fades up on the same delay, driven by CSS
(`.numbers.is-in .numbers__item:nth-child(n)`).

Counting lives in a `useCountUp(target, delay, active)` hook inside
`Numbers.tsx`, on `requestAnimationFrame`. It formats with
`toLocaleString("en-US")` on every frame and the figure keeps
`tabular-nums`, so digits do not jitter. `active` is whether the band has
revealed: `useReveal` is extended to return `[ref, inView]`, with the
boolean set in the same callback that adds the class. Existing callers
destructure only `ref`.

**Honesty.** A `null` value renders the dash and does not count. The hook
always animates from the value currently shown to the new target, starting
at 0, so a figure that arrives after the band is in view counts up then,
and a figure that changes later (a refetch) moves from its old value rather
than restarting.

**Reduced motion.** `prefers-reduced-motion: reduce` shows the final value
at once (the hook checks `matchMedia` and returns `target`), and the
caption fade is dropped.

## Showcase

- `--sc-hold` 6s → **4s**. The drift stays `hold + 1.5s`, so it shortens to
  5.5s.
- The hover pause narrows from `.showcase:hover` to `.showcase__tabs:hover`.
  Reading with the cursor on the photograph no longer stops the tour;
  hovering the tab row, where a click is likely, still does. The off-screen
  and `:has(:focus-visible)` pauses stand.
- `.showcase__track` grows to 3px and its background lightens to
  `rgba(255,255,255,0.3)` so the fill reads as a progress bar.
- The crossfade shortens from 0.9s to 0.6s; the outgoing slide's delayed
  drop-out shortens to match.

The bar-as-clock structure (`animationend` advances the slide, one
play-state rule) is unchanged, and the section comment in `Showcase.tsx`
and `landing.css` is updated to say four seconds.

## Outcome band

The scroll listener and per-frame maths go. In their place, one
`IntersectionObserver` at threshold 0.35 adds `is-in` once and disconnects,
the same shape as `useReveal`; the band reuses that hook.

Everything then runs in CSS from `.outcome.is-in`:

| What | Property | Timing |
|---|---|---|
| Hairlines | `stroke-dashoffset` 1440 → 0 | 0.8s ease-out, no delay |
| Outlines (`.outcome__draw`) | `stroke-dashoffset` from `data-len` → 0 | 1.0s ease-out, no delay |
| Fills (`.outcome__fill`) | `transform: translateY(100%) → 0` inside a `clipPath` that is now the block's own rounded rect, fixed | 0.7s ease-out, 0.6s delay |
| Copy | as today | as today, delays unchanged |
| Signal | `opacity` 0 → 1, then the existing loop | 0.6s, 1.6s delay |

The `data-len` attributes stay, because each outline's dasharray and starting
offset must equal its own length; the effect sets `strokeDasharray` and the
initial `strokeDashoffset` from them once on mount, as it does now, and the
CSS transition carries the value to 0. The two `clipPath` rects lose their
`ref`s and become static copies of the block geometry; the fill's rise is a
`transform` on the `.outcome__fill` rect with `transform-box: fill-box`,
which is why no JavaScript runs per frame.

Finished picture in about 1.8s. It does not depend on where the scroll
stops, and it does not replay.

**Reduced motion.** Unchanged in intent: outlines and fills at rest, copy
shown, no signal loop. The `translateY` rule is added to the existing
reduced-motion block.

## Files

| File | Change |
|---|---|
| `ui/src/components/landing/useReveal.ts` | Returns `[ref, inView]`. |
| `ui/src/components/landing/Numbers.tsx` | `useCountUp`, centred cells, per-item delay. |
| `ui/src/components/landing/Showcase.tsx` | Comment: six seconds → four. |
| `ui/src/components/landing/OutcomeBand.tsx` | Drop the scroll listener and clip refs; `useReveal(0.35)`; static clip rects. |
| `ui/src/landing.css` | Numbers width, alignment and caption fade; showcase hold, track, pause selector, crossfade; outcome transitions and reduced-motion additions. |
| `docs/superpowers/specs/2026-09-19-landing-page-design.md` | Bands 3, 4 and 5 point here. |

## Testing

`npx tsc --noEmit`, `npm run lint`, `npm run build`, then on `/` at 1440
wide with the mock server running:

1. Scroll to the numbers: four figures count up once, left to right, and
   are centred on the page. Scroll away and back: they do not count again.
2. Park the mouse on the showcase photograph: the underline fills over four
   seconds and the slide advances. Move it onto the tabs: it pauses.
3. Scroll so the outcome band is a third visible and stop: the outlines
   draw, the fills rise, the copy appears, the signal loops. No half-filled
   block remains.
4. With `prefers-reduced-motion` emulated in DevTools, every band shows its
   final state with no motion.
