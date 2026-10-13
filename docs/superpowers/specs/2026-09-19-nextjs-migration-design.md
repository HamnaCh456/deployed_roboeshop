# Move the UI from Create React App to Next.js

Date: 2026-09-19. Status: approved, implementing.

## Scope

Only `ui/` changes. The scraper stays Python; the mock server stays as it is
and keeps serving `GET /catalog`, `GET /tutorials`, `POST /query/stream` on
port 8009. The migration is done in place in `ui/` on a branch so every
existing file keeps its git history.

Out of scope: server-rendering any page, the product-detail page, upgrading
Tailwind or MUI, touching the mock server.

## Framework

Next 16 (App Router), React 19, TypeScript 5. Removed: `react-scripts`, its
eight security `overrides`, and `react-router-dom`. Kept unchanged: Tailwind 3,
`@mui/icons-material` (the only MUI package the code imports — no
`@mui/material` component is used, so no Emotion SSR registry is needed),
dompurify, showdown, react-toastify, FontAwesome.

## Routes

| Path | File | Renders |
|---|---|---|
| `/` | `src/app/page.tsx` | `Catalog` + `ChatWidget` |
| `/catalog` | `src/app/catalog/page.tsx` | same, so the URL names the page |
| `/catalog/[category]` | `src/app/catalog/[category]/page.tsx` | same, category preset |
| `/tutorials` | `src/app/tutorials/page.tsx` | `Tutorials` |
| `/community` | `src/app/community/page.tsx` | `Community` |
| `/assistant` | `src/app/assistant/page.tsx` | `Apparel` + `Chatbox` |

`src/app/layout.tsx` is the one server component: `<html>`/`<body>`, the
global CSS imports, `Navbar`, `ToastContainer`, and the metadata that used to
live in `public/index.html` and `manifest.json`.

## State shared across routes

`newRenderImage` (the image the assistant renders into on `/assistant`, set by
either chat surface) was `useState` in `App.tsx`. A layout cannot hold client
state for its pages, so it moves to `src/context/RenderImageContext.tsx`, a
client provider mounted in the layout. `Apparel`, `Chatbox` and `ChatWidget`
read it from context instead of props.

## Client boundaries

`"use client"` on every page file and every component under `components/`.
The code reads `window`, `localStorage` and `document` in ten files; all of
those are components or called only from effects. `reviewStore.ts` is not a
component and gets no directive.

## API swaps

| react-router | next |
|---|---|
| `useSearchParams`, `useParams` | same names from `next/navigation` |
| `useNavigate()(path)` | `useRouter().push(path)` |
| `<Link to>` | `<Link href>` from `next/link` |

`useSearchParams` in the App Router must sit under a `<Suspense>` boundary or
`next build` fails on the static prerender; the catalog pages wrap `Catalog`
in one.

## Config and environment

`REACT_APP_API_BASE_URL` becomes `NEXT_PUBLIC_API_BASE_URL` in
`src/config/config.ts` and `ui/.env`. `next.config.ts` sets
`images.unoptimized: true` because product photos are plain `<img>` tags to
remote supplier hosts. `src/index.tsx`, `src/App.tsx`, `public/index.html`
and `public/manifest.json` are deleted.

## CSS

`index.css`, `chatbox.css`, `catalog.css`, `tutorials.css`, `community.css`
are imported from the layout and the pages exactly as they are. `chatbox.css`
and the `[ref]`-annotated values in `catalog.css` are not edited.

## Docker

`ui/Dockerfile` keeps its shape: the image-symlink step and `npm run start`
stay. `start` now runs `next start` after `next build`; `dev` runs `next dev`.

## Verification

There are no UI tests, so the bar is the existing one plus a browser pass:

- `npx tsc --noEmit`, `npm run build`, `npm run lint` all clean
  (eslint config switches to `eslint-config-next`)
- Against the running mock server, each of the six routes loads with a clean
  console, including a deep link such as
  `/catalog?category=educational-robots&sort=price_asc`, the assistant SSE
  stream on `/assistant`, and writing then reloading a community review.

## Docs

The commands block in `CLAUDE.md`, `ui/README.md` and any path table in
`docs/PAGES.md` are updated to match.
