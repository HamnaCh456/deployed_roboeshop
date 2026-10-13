# Photo card

**Date:** 2026-09-19
**Status:** Adopted. Rolled out to the tutorial grid, the catalogue grid and
the community feed in the same change.

## Why

The grid cards read as flat and cartoonish next to a real product card: a
6px corner, a hairline ring, no hover, six stacked lines of text and a row
of pills. Two references were judged against the tutorial grid, in place,
with the classic card alongside:

1. A full-bleed card, the photo filling the whole card and the text on a
   gradient at its foot. Rejected: the text overlapped the image, and the
   tutorial thumbnails are the publishers' cover posters with a title baked
   in, so the overlay covered words.
2. A course card: photo on top, white body below, provider line, title,
   two-line description, a footer of icon + fact pairs and an outline
   button. Adopted.

## The card

```
┌──────────────────────────┐
│                          │
│   photo, 3:2, edge to    │
│   edge, nothing on it    │
│                          │
├──────────────────────────┤
│ (logo) Author, Publisher │
│ Title on up to two lines │
│ Summary, two lines max…  │
│ ─────────────────────────│
│ ▶ Video · ⫽ Beginner     │
│ ▣ Rs 1,700 · 4 parts     [Open] │
└──────────────────────────┘
        soft shadow below
```

**Surface.** White, 16px radius, a two-part drop shadow
(`0 1px 2px rgba(0,0,0,.05), 0 10px 28px -8px rgba(0,0,0,.22)`). On hover
the card lifts 3px, the shadow deepens, and the photo zooms 5% over 600ms,
slower than the 280ms lift so it is still settling when the card has
arrived. Reduced motion turns both off.

**Photo.** Fills the top edge to edge. Nothing sits on it: no pill, no badge.
Tutorial thumbnails are cropped to fill a 3:2 box, chosen over 16:9 because
most are 4:3 posters with a title near the top and 3:2 trims 5% off each
edge where 16:9 would take 12% and cut the title. Product photos keep
`object-fit: contain` on white, because cropping a component cuts its pins
off; the box is 1:1. A missing photo is a dark gradient tile with a mono
"No photo".

**Body.** 20px sides, 10px between lines. One medium-weight line, the title
(16px / 500, tracking -0.015em); everything else is regular weight. The
byline leads with the publisher's mark, a favicon in a 26px white circle,
because a course card leads with the provider and we do not host these
tutorials. Summary is the publisher's, clamped to two lines.

**Footer.** Under a hairline, its own row. Facts are icon + word, stacked
two lines deep (format · level, then kit price), because at three columns
they do not fit on one line beside the button. The button is an outline
pill, 36px, 8px radius, "Open" on a tutorial and "View at seller" on a
product. It is drawn, not focusable: the card is one link, the title,
stretched over everything, so keyboard users get one stop.

**No pills.** The classic card had a pill per fact, which was the
congestion. The format used to be a pill on the photo; it now costs one
icon's width in the footer.

## Departures from DESIGN.md

Two, both deliberate and recorded in DESIGN.md §4 "Photo Card":

- Depth is a drop shadow, not a hairline ring (§7 said never). A photo with
  a ring around it looks like a sticker.
- The radius is 16px, not 6px. A 6px corner on a 300px-tall photo reads as
  a screenshot.

Everything else in the system holds: Geist Sans and Mono, the achromatic
scale, mono stamps, tabular figures, one link per card.

## Where it is applied

| Surface | File | Notes |
|---|---|---|
| Tutorial grid | `ui/src/components/tutorials/TutorialCard.tsx`, `tutorials.css` `.tut-card` | The full card |
| Catalogue grid | `ui/src/components/catalog/ProductCard.tsx`, `catalog.css` `.pcard` | The full card; photo `contain` on white |
| Community feed | `community.css` `.com-review` | Surface only: radius, shadow, 2px lift. A review is prose and keeps its own layout |
| Chat panel `.robot-card` | `chatbox.css` | Surface at chat size: 12px radius, a slightly shorter shadow, 2px lift, photo `contain`. Body layout unchanged |
| Catalogue skeleton | `catalog.css` `.catalog__skeleton` | Same radius and resting shadow as the card it becomes |

**Category pages.** `/catalog/[category]` (Controllers, Sensors, …) is the
same `CatalogScreen` and `ProductCard` as `/catalog`, so it needs nothing of
its own.

## Publisher marks

`ui/public/images/sources/*.png` are the three publishers' favicons, fetched
once. Their sites 403 a hotlink. The map from `sourceName` to file lives in
`TutorialCard.tsx`; an unknown publisher falls back to an initial.

## Images

The thumbnails are what the Archive captured; the pipeline's rule that the
data never carries an image we did not find in the CDX index still holds.
AI-generated stand-ins were tried on one card and looked right, but every
generator available at the time was out of credit, so none ship. If they
are ever added, they go in a UI-side table keyed by tutorial id, not in
`tutorials.json`.
