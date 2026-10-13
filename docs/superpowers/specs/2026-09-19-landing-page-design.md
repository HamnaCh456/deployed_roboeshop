# Landing page

**Status:** approved in a visual brainstorm on 2026-09-19; being built.

## Why

`/` is the catalogue today. That is the right front door for someone who
already knows they want a part, and the wrong one for the audience the
proposal names: students, lecturers and makers who arrive not knowing which
robot to buy. A landing page has one job, to say what Servo is and put the
assistant in their hands, in the time it takes to read one line.

The reference is [generalrobotics.company](https://www.generalrobotics.company/):
one claim per screen, one image per screen, mono labels, generous space,
motion that draws attention without decorating. Measured, its "premium"
feel is a static hero photo, a Vimeo embed, five small Lottie shapes and
scroll-reveal fades. The restraint is the design; nothing here needs video.

## Audience

Real Pakistani buyers, mostly academic: kids starting out, university lab
courses, final-year and research projects. Not the FYP panel. Copy is bold
but never claims a feature the app does not have (no "verified sellers",
no "connect with buyers"; `seller_verified` is empty and there is no
messaging).

## Decisions taken in the brainstorm

| Question | Decision |
|---|---|
| Hero direction | **Assistant-first.** The hero is "What are you building?" over a slim ask bar. Catalogue, compare and tutorials are proof sections underneath. |
| Hero image | Full-bleed photo, content centred and held in the top ~38% of the image so the humanoid in the centre of the frame is never covered. The current file is General Robotics' own hero asset, used as a **placeholder at the user's request**; it must be replaced with our own image before the site is public. |
| Nav | On the paper, not over the photo: the existing 64px `#fafafa` bar with its hairline, photo starts under it. An **Ask Servo** filled pill is added to the bar's editorial cluster, on every page. |
| Ask bar | 48px, hairline ring, `⌘K` hint and a search glyph at the end, no button. Proportions from [Kokonut UI's Action Search Bar](https://21st.dev/@kokonutd/components/action-search-bar). At rest it shows one line of underlined example prompts under it; the Raycast-style dropdown (S2 in the brainstorm) is not in this build. |
| Design system | The Vercel reference now in `DESIGN.md`. Geist 450 with -0.06em tracking for display, 6px radii, stacked-ring hairlines, `#171717` fills, Geist Mono eyebrows. White type on the photo is the necessary consequence of the one permitted photograph. No em dashes in copy. |
| Band headline | **Choose robots faster** (default; alternatives B to D were offered and not picked). |
| Motion | The "Deploy robots faster" band is reproduced in SVG: rounded rectangles whose outlines draw with `stroke-dashoffset`, fills that rise with a clip rect, copy that fades up, and a white signal that loops the tall block once drawn. Driven by scroll position, no Lottie, no library. Other bands use a plain reveal (opacity and 14px rise) on intersection. |

## Page

Top to bottom. Every number is fetched at render time from the mock server
(`GET /health`, `GET /catalog` facets); nothing is typed into the page.

1. **Hero.** Eyebrow `PAKISTAN'S ROBOTICS MARKETPLACE`, display "What are you building?", the ask bar, one line of example prompts, a mono stats line (`N robots · N tutorials · N stores`). Submitting the bar goes to `/assistant?q=<question>` and the assistant sends the question as the first message once its intro has played.
2. **Store strip.** `PRICES PULLED FROM` then the five sources in slate, `REFRESHED BY CRAWL` at the end. Sources are listed in `config.ts`.
3. **Outcome band** on `#ebebeb`: eyebrow `ONE SEARCH, EVERY STORE`, "Choose robots faster", one line, a black pill to `/catalog`, the drawn shapes. Motion revised in [2026-09-19-landing-motion-design.md](2026-09-19-landing-motion-design.md): it plays once on entry, not on scroll position.
4. **Numbers.** Four mono figures with mono captions: robots and parts, categories, tutorials, stores. No headline. Centred and counting up since the motion revision.
5. **Showcase** (revised 2026-09-19, replacing the Modules, Categories, Who-it's-for and Closing bands). One full-bleed photograph at a time with one claim over it, and four tabs along the bottom edge: **Robots · Compare · Tutorials · Community**. The active tab's underline fills over four seconds (six until the motion revision); when it is full the next photograph fades in over the last. General Robotics' industry rail (Warehouse, Government, Manufacturing, Energy) turned into a tour of what Servo does.
   - The underline is the clock: a CSS `scaleX` animation whose `animationend` advances the slide, so bar and picture cannot drift apart and there is no interval. Clicking a tab jumps to it. The tour pauses while the band is off screen, while the mouse is over the tab row (not the whole band), or while it holds keyboard focus (`:has(:focus-visible)`, so a click does not freeze it), via one `animation-play-state` rule.
   - The "video" is a 5.5s push-in (`scale 1.02 → 1.1` with a small pan) on the active photograph. Real video was considered and set aside: image-to-video generation bills per still and ships a 4x heavier page for the same effect. `prefers-reduced-motion` drops the drift and the crossfade; the bar still fills.
   - Copy: eyebrow, display headline, one line, a white pill. The robot and tutorial counts come from `useLandingStats`, not typed in.
   - Photographs in `ui/public/landing/showcase-*.jpg` are General Robotics assets, the same placeholder status as the hero: replace before the site is public. None repeats the hero, which is their warehouse frame (the user asked for four distinct pictures: cobot on a bench, robot hand, lab arms, robot dog). Three are small web copies, 970px, 210px and 737px wide, and read soft at 1440px until better files exist.
6. **Footer** (revised 2026-09-19) on `#171717`, in [Profound's](https://www.tryprofound.com/) arrangement: the wordmark and a two-line description on the left, then three headed columns, **Explore** (the five pages), **Categories** (the navbar taxonomy, each to `/catalog/<slug>`) and **Prices from** (the five stores, as names one shade dimmer because the app holds no URLs for them), then a hairline and a mono legal line: the year and "Prices shown as each seller quoted them. Refreshed by crawl." Every column reads from `config.ts`. The display-scale wordmark in hairline grey that used to close the page is gone. No institution line (the user has not said which).

Removed in the same revision: the six module cards ("Not a store. The thing you open before the store."), the six category tiles, the three audience cards and the second ask bar, along with their photos and CSS. The catalogue's category strip in the navbar covers what the tiles did.

## Code

| File | Role |
|---|---|
| `ui/src/app/page.tsx` | Now renders `LandingScreen`. `/catalog` is unchanged and is the catalogue's only route. |
| `ui/src/components/landing/LandingScreen.tsx` | The scroll container and section order. |
| `ui/src/components/landing/Hero.tsx`, `AskBar.tsx`, `OutcomeBand.tsx`, `StoreStrip.tsx`, `Numbers.tsx`, `Showcase.tsx`, `LandingFooter.tsx` | One file per band. |
| `ui/src/components/landing/useReveal.ts` | IntersectionObserver hook that adds `.is-in`. |
| `ui/src/hooks/useLandingStats.ts` | `/health` and `/catalog` facets, through `fetchCache`. |
| `ui/src/landing.css` | Tokens redeclared under `--l-*`, all band styles, the reveal and band animations. Own file, same rule as `community.css`: sharing would mean editing one screen to serve another. |
| `ui/src/components/Navbar.tsx` | Adds the Ask Servo pill. |
| `ui/src/components/chatbox/chatbox.tsx` | `initialQuery` prop; `handleSendMessage` takes an optional text. The upstream SPDX header stays. |
| `ui/src/app/assistant/page.tsx` | Reads `?q=` under a Suspense boundary and passes it in. |
| `ui/src/config/config.ts` | `ui.stores`: the five source names. |

The layout's `h-screen` flex column means the landing page scrolls inside
its own element (`.landing`, `calc(100vh - 64px)`, `overflow-y: auto`),
the same pattern as tutorials and community. The band animation listens to
that element, not `window`.

## Not in this build

- The dropdown list under the ask bar (brainstorm S2).
- Lenis-style smooth scrolling; native `scroll-behavior: smooth` is enough.
- Our own hero and showcase photographs (see above).
- Real video in the showcase; the CSS drift stands in for it.

## Testing

`npx tsc --noEmit`, `npm run lint`, `npm run build`, and a clean console on
`/`, `/catalog`, `/assistant?q=test` with the mock server running. Check
the hero at 1440×900 and 1280×720: the ask bar must sit above the robot's
head at both, and the first band must be reachable in one scroll.
