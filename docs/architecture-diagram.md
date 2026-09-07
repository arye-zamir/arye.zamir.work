# Architecture diagram integration

The first integrated diagram is Alektions, available from `/see` at
`/see/alektions-election-events-map`. The existing portfolio-platform entry remains in the gallery.
The other three blog diagrams are not imported in this milestone.

## Source and ownership

The source is `blog.zamir.work/.vitepress/theme/architecture-diagram`, inspected on 2026-09-07.
The source repository HEAD was `d1899e0`; the imported files came from its working tree.
The stylesheet comes from `blog.zamir.work/docs/public/portfolio/architecture-diagram.css`.

Source SHA-256 receipts:

| File                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `archify-runtime.js`                       | `881761517016054ce46f8c57cc463bb17bec35e456eb980135691f072ee5ade7` |
| `assets/alektions-election-events-map.svg` | `088bd52bff894cd6b7da226610c9493d65aaa8b9b0c4afda6bb5f3c9c99fb4b4` |

The imported SVG, with its title punctuation and description adapted for this site, contains 12 semantic nodes and 11 authored relationships. Older migration
checklists in the blog are not the acceptance baseline for this snapshot.

The runtime remains JavaScript behind its TypeScript declaration and typed browser scope.
The local runtime changes share initial theme resolution with Vue, remove unused bindings and
the automatic reader-width adjustment, and satisfy the repository's JavaScript lint and formatting rules. The browser adapter owns
navigation, DOM query isolation, and disposal. Future source refreshes must preserve these boundaries.

## Integration contracts

- `src/internal/diagrams.ts` contains lightweight route and metadata definitions. It imports no viewer assets.
- `DiagramView.vue` is a lazy route. Its CSS and JavaScript are fetched only when visiting the viewer.
- `diagram-data.ts` imports only the Alektions payload and bundled shared markup.
- `ArchitectureDiagram.vue` mounts one runtime after Vue has inserted the static markup. Unmount disposes it.
- `runtime-history.ts` preserves browser history state while synchronizing viewer URL changes through Vue Router.
  Viewer state replaces the current entry; Back and Forward navigate between pages.
- `runtime-scope.ts` scopes DOM queries to the article, keeps keyboard listeners on the document, and
  releases global listeners, observers, timers, and animation frames. Disposed sessions reject new scheduled work.
- `initial-state.ts` resolves query theme, saved preference, then the light default. The initial attributes
  exist before the article is painted; the runtime uses the same theme resolver.
- The site document retains its chosen locale. The English diagram has an explicit `lang="en"` and `dir="ltr"`.
- Focus and scroll reset only when the page path changes, so semantic hash updates preserve the reader's position.
- Runtime initialization failure leaves the diagram readable and reports a localized message.
- The reader uses responsive CSS with a 1440px maximum width. The imported height-fitting loop
  alternated between wider and narrower canvases as it measured overflow and resized the cards.
- The mobile canvas toolbar uses native horizontal sticky positioning. It does not use the
  runtime's scroll-offset transform, which could lag behind browser scrolling. The toolbar
  remains inside the canvas so the runtime's control queries and keyboard behavior keep working.

The `vue/no-v-html` exception applies only to `ArchitectureDiagram.vue`. Its HTML inputs come exclusively
from checked-in imports in `diagram-data.ts`; URL parameters, translations, and network content are never
interpolated into that markup. Keep this exception narrow when extending the catalogue.

The source stylesheet still requests JetBrains Mono from Google Fonts when a diagram is opened.
Monospace fallbacks apply if that request is unavailable.

## Verification

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

The browser suite builds the production application and starts its own preview server on port 5015.
It does not reuse the development server or another session's preview. Desktop Chrome, Pixel 7, and 320px mobile
projects exercise rendering, theme persistence, node search, semantic lens, guided chapters,
focused-node deep links, navigation and unmount, Hebrew direction, presentation/embed links,
unknown diagram routes, and lazy asset loading. Layout checks assert a shared header, equal-sized controls,
toolbar centering immediately during canvas scrolling, and a light default even when the device prefers dark.
A desktop regression samples canvas dimensions over consecutive animation frames at four window sizes,
including the sizes that reproduced the width oscillation. Screenshots are written to `test-results/`.

Unit tests cover theme precedence and blocked storage, initial presentation/embed attributes,
preservation of router history state, deployment-base handling, and rejection of stale or foreign URL writes.

The host must serve `index.html` for direct viewer requests, as it already must for `/see` and `/read`.

## Adding another diagram

Add that diagram's SVG, cards, guided-view data, and metadata as one payload module. Extend the
lightweight catalogue and route configuration, then make the viewer accept the selected payload.
Key the runtime component by diagram ID and retain a lazy boundary for payload loading. Test switching
between diagrams and leaving during a pending load before adding more entries. Reuse the runtime and
stylesheet; do not duplicate them or make the gallery import the full payload registry.
