# Frontend

React 19 + TypeScript + Vite. Consumes the FastAPI backend documented in
[`../backend/README.md`](../backend/README.md); see the
[root README](../README.md) for what the product does and how the credit-tier
and "your take, so far" calculations work.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # prebuild → tsc -b && vite build → postbuild
npm test           # vitest, single run
npm run test:watch
npm run lint       # oxlint
```

`build` is wrapped by two Node steps that are easy to miss:

- **`prebuild`** runs `scripts/generate-sitemap.mjs`, emitting
  `public/sitemap.xml` from the card catalog. Degrades to the static routes if
  `backend/data/cards` isn't present.
- **`postbuild`** runs `scripts/prerender.mjs`.

## Prerendering

The app is client-rendered, but shipping one generic `<title>` for every route
meant shared card links previewed identically and search engines had nothing
per-page to index.

`scripts/prerender.mjs` writes a real `dist/<route>/index.html` per route, each
with its own title, description, canonical and OpenGraph tags. **Only the
`<head>` differs** — the `<body>` is byte-identical to the SPA shell, so React
boots unchanged. No headless browser, no hydration concerns.

Two things make this safe:

- Render serves a file if one exists at that path before applying the
  `/* → /index.html` rewrite, so the prerendered files aren't clobbered and
  `render.yaml` needs no special casing. Unknown routes still fall through to
  the SPA shell.
- The script asserts every tag it rewrites was actually found and **fails the
  build otherwise**, so editing `index.html` can't silently ship generic
  metadata. `tests/utils/routeMeta.test.ts` pins the same contract.

## Where things live

```
src/
├── api/          # Typed fetch layer against the backend
├── components/   # Shared UI (SiteMark, PageTabs, InfoModal, Compare*, …)
├── constants/
├── hooks/
├── pages/        # One per route: Issuers, IssuerCards, CardDetail, TopPick, Compare, Methodology
├── types/        # Card / CardSummary shapes mirroring backend/models.py
├── utils/
└── index.css     # All styling: design tokens + component classes, plus Tailwind
scripts/          # generate-sitemap.mjs, prerender.mjs, routes.mjs
tests/            # Vitest + Testing Library, mirroring src/
```

### Utilities worth knowing about

| File | Why it matters |
|---|---|
| `utils/routeMeta.js` | Single source of truth for every route's title and description. **Plain JS on purpose** — imported by both the React app and the Node build scripts, so prerendered `<head>` and client-set tags can't drift. `SEO_ISSUERS` must stay in sync with `ISSUERS` in `cardTaxonomy.ts` or the sitemap and prerender miss an issuer page. |
| `utils/cardTaxonomy.ts` | `ISSUERS`, plus the hand-authored `CLASSIFICATION` table mapping every card id to personal / airline / hotel / cobrand. A test asserts it matches the real catalog in both directions, so an unlisted card fails CI rather than silently defaulting. |
| `utils/topPickCategories.ts` | The Top Picks ranking. Ranks on `multiplier × best_cpp`, handles points pooling, and is provably blind to the affiliate flag. |
| `utils/seo.ts` | `useSeo` hook, dependency-free. Skips `undefined` so a page can call it before data loads without blanking the previous route's tags. |
| `utils/cardImages.ts` | Auto-discovers `assets/cards/*` by glob; filename minus extension is the card id. Drop a file in, it's wired up. Note the glob's extension list — a format not in it is silently ignored. |
| `utils/analytics.ts` | GA4. `gtag` pushes the **`arguments` object, never an array** — gtag.js only treats `[object Arguments]` as a command and silently drops anything else. A regression test pins this; it cost weeks of zero data once. |

## Styling

One stylesheet, `src/index.css`: design tokens in `:root`, then component
classes, alongside Tailwind utilities used inline. Two fonts, both self-hosted
via `@fontsource-variable` and imported in `main.tsx`:

- **Fraunces** — display serif, for headings and card titles
- **Space Grotesk** — body sans, for UI text and the header lockup

The header lockup deliberately uses the body sans rather than the display serif;
`components/SiteMark.tsx` records why.

## Testing

Vitest with Testing Library and jsdom. Two limitations worth remembering, both
of which have caused real confusion:

- **jsdom applies no stylesheet.** Elements hidden only by CSS still render and
  still contribute to text content, so an accessible name can be the
  concatenation of a long and short label. Match by substring rather than exact
  string where a media query is involved.
- Anything purely visual (the header's scroll collapse, responsive breakpoints)
  can't be asserted here — only the state that drives it, such as the class the
  scroll handler toggles.

For real-browser checks, note that resizing the window does **not** change the
viewport for media-query purposes. Inject a same-origin `<iframe>` at the target
width and inspect `iframe.contentWindow` instead.
