# Brand mark

**Date:** 2026-09-19
**Status:** approved

## The name

Servo stays. It was already `config.ui.brand`, already the navbar's "Ask
Servo", already the name the assistant introduces itself with in
`src/agent/prompt.ts`. It reflects what the site is: an aggregator built by
people who know the parts, and a servo is the one part every robot in the
catalogue, from an SG90 to a UR3e, has inside it. The alternatives weighed
and rejected: Torque (generic, fits a gym), Gantry (right metaphor, unknown
word), Botdex (clear, but a startup name in a Geist-set monochrome interface).
The one collision, Mozilla's Servo engine, is a different market.

## The mark

A servo's 180 degree range as a half disc, needle parked at 45 degrees, a
notch at the pivot. One shape, one colour. Chosen over a four-arm servo horn
(recommended, rejected by the user) and a PWM square wave (goes soft under
16px).

Geometry, on a 24 wide by 12 high box:

- Half disc: centre (12, 12), radius 12. Flat edge is the baseline.
- Pivot notch: circle at the centre, radius 2.2, cut out. Half of it falls
  below the baseline, so it reads as the origin notch on a protractor.
- Needle: a 2.4 wide round-capped line from the centre to (19.5, 4.5), cut
  out. 45 degrees, which is a servo at its midpoint.

The cut-outs are holes, not ground-coloured strokes, so the mark inverts by
changing one colour. In React that is a `<mask>` keyed by `useId()`; in the
static files it is the same mask with a fixed id.

Colour follows DESIGN.md: the mark is pure `#000000` on light surfaces, the
one element allowed to be, and `#ffffff` on ink. Never a border, never a
gradient, never a third colour.

The wordmark does not change: "Servo" in Geist Sans 500, set exactly as the
navbar sets it today. The mark sits to its left with an 8px gap, its baseline
on the text's baseline, its width 20px against 14px text.

## Where it goes

| Surface | File | Treatment |
|---|---|---|
| Navbar | `components/Navbar.tsx` | Replaces the 10px black square. 20x10, `#000`. |
| Landing footer | `components/landing/LandingFooter.tsx` | Replaces `.foot__glyph`. 20x10, `#fff` on ink. |
| Browser tab | `app/icon.svg`, `app/icon.png`, `app/apple-icon.png` | Next's file conventions. The SVG is the bare mark with a `prefers-color-scheme` swap. The PNGs are the mark in white on a black rounded square, so they hold on any tab colour and as a home-screen icon. `public/favicon.png` (NVIDIA's) goes. |
| Chat header | `components/chatbox/chatbox.tsx` | 16x8 mark before the assistant's name. |
| Chat launcher | `components/catalog/ChatWidget.tsx` | Mark replaces the MUI speech bubble; label becomes "Ask Servo", the same words the navbar, hero and footer use. |
| Assistant avatar | `public/advisor.svg` | The mark in white on a `#171717` disc replaces the robot face, so every reply carries the brand. |
| Standalone | `public/logo.svg` | The bare mark, for READMEs, slides, and anyone who asks for the logo. |

Not added: the auth cards and status pages. Both render under the navbar,
which already carries the mark 100px above; a second copy would be
decoration.

## Component

`components/Mark.tsx`: `<Mark width={20} className? />`. Renders the inline
SVG at `width` by `width / 2`, fill `currentColor`, `aria-hidden`. Colour is
the parent's `color`, so a caller sets `text-[#000000]` or inherits white
from an ink surface. It is the only place the geometry is written in TSX;
the static files carry the same numbers.

## Verification

`npx tsc --noEmit`, `npm run build`, `npm run lint`. Then in the browser: the
navbar, the footer on `/`, the tab icon in light and dark, the launcher on
`/catalog`, and one assistant reply on `/assistant`.
