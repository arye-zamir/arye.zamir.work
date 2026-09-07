# Architecture diagram integration

The gallery at `/see` contains Alektions, Amiit.AI, and Commodity Trading, in that order:

- `/see/alektions-election-events-map`
- `/see/amiit-platform-architecture`
- `/see/commodity-trading-platform`

Household AI Assistant is an earlier iteration of Amiit.AI and is excluded from the site.

## Source and ownership

The source is `blog.zamir.work/.vitepress/theme/architecture-diagram`, inspected on 2026-09-07.
The source repository HEAD was `d1899e0`; the imported files came from its working tree.
The stylesheet comes from `blog.zamir.work/docs/public/portfolio/architecture-diagram.css`.

Source SHA-256 receipts:

| File                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `archify-runtime.js`                       | `881761517016054ce46f8c57cc463bb17bec35e456eb980135691f072ee5ade7` |
| `assets/alektions-election-events-map.svg` | `088bd52bff894cd6b7da226610c9493d65aaa8b9b0c4afda6bb5f3c9c99fb4b4` |

The Alektions SVG, with its title punctuation and description adapted for this site, contains 12 semantic nodes and 11 authored relationships. Amiit contains 18 semantic nodes and 19 authored relationships. Its source guided-view payload is empty, so the guided chapter panel stays hidden. Commodity Trading contains 15 semantic nodes, 17 authored relationships, and three guided views based on the owner's corrected architecture. Older migration
checklists in the blog are not the acceptance baseline for this snapshot.

The runtime remains JavaScript behind its TypeScript declaration and typed browser scope.
The local runtime changes share initial theme resolution with Vue, remove unused bindings and
the automatic reader-width adjustment, and satisfy the repository's JavaScript lint and formatting rules. The browser adapter owns
navigation, DOM query isolation, and disposal. Future source refreshes must preserve these boundaries.

## Integration contracts

- `src/internal/diagrams.ts` contains lightweight route and metadata definitions. It imports no viewer assets.
- Each diagram has a small lazy route entry (`AlektionsDiagramView.vue`, `AmiitDiagramView.vue`, or `CommodityDiagramView.vue`) and a
  separate payload module. Vue Router owns pending navigation, including cancellation when leaving during a load.
- `diagram-data.ts` assembles a payload with the bundled shared markup. It imports no diagram-specific assets.
- `DiagramView.vue` accepts the selected payload and keys `ArchitectureDiagram.vue` by diagram ID.
- `ArchitectureDiagram.vue` mounts one runtime after Vue has inserted the static markup. Unmount disposes it.
  All diagrams use the same runtime and stylesheet. Opening one does not download the other payloads.
- `runtime-history.ts` preserves browser history state while synchronizing viewer URL changes through Vue Router.
  Viewer state replaces the current entry; Back and Forward navigate between pages.
- `services/diagram-runtime.ts` scopes DOM queries to the article, keeps keyboard listeners on the document, and
  releases global listeners, observers, timers, and animation frames. Disposed sessions reject new scheduled work.
- `initial-state.ts` resolves an explicit link theme or the shared `zui__theme` preference. The default is
  `system`; the initial attributes exist before the article is painted. See [storage and preferences](storage.md).
- The site document retains its chosen locale. The English diagram has an explicit `lang="en"` and `dir="ltr"`.
- Focus and scroll reset only when the page path changes, so semantic hash updates preserve the reader's position.
- Runtime initialization failure leaves the diagram readable and reports a localized message.
- The reader uses responsive CSS with a 1440px maximum width. The imported height-fitting loop
  alternated between wider and narrower canvases as it measured overflow and resized the cards.
- The wide-diagram canvas toolbar uses native horizontal sticky positioning at every viewport, including desktop when guided-view zoom creates overflow. It does not use the
  runtime's scroll-offset transform, which could lag behind browser scrolling. The toolbar
  remains inside the canvas so the runtime's control queries and keyboard behavior keep working.

The `vue/no-v-html` exception applies only to `ArchitectureDiagram.vue`. Its HTML inputs come exclusively
from checked-in payload imports assembled by `diagram-data.ts`; URL parameters, translations, and network content are never
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
unknown diagram routes, isolated payload loading, switching projects, and cancellation during pending loads. Layout checks assert a shared header, equal-sized controls,
toolbar centering immediately during canvas scrolling, and theme changes through the shared footer.
A desktop regression samples canvas dimensions over consecutive animation frames at four window sizes,
including the sizes that reproduced the width oscillation. Screenshots are written to `test-results/`.

Unit tests cover theme precedence and storage validation, initial presentation/embed attributes,
preservation of router history state, deployment-base handling, and rejection of stale or foreign URL writes.

The host must serve `index.html` for direct viewer requests, as it already must for `/see` and `/read`.

## Adding another diagram

Add that diagram's SVG, cards, guided-view data, and metadata as one payload module. Extend the
lightweight catalogue and route configuration, then pass the selected payload to the shared viewer.
Keep the runtime component keyed by diagram ID and add a small lazy route entry for the payload. Test switching
between diagrams and leaving during a pending load before adding more entries. Reuse the runtime and
stylesheet; do not duplicate them or make the gallery import the full payload registry.

## Amiit source receipt

Imported from the source working tree on 2026-09-07. Only title/description wording, dash punctuation, and
HTML/JSON formatting were adapted. Topology and source cards remain intact. No cover image or guided
chapters were invented.

| Source file                                        | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `assets/amiit-platform-architecture.svg`           | `44ef1900a58c63bc0c62a22cc6e4a7c4f265353580503018866c67797551e4e4` |
| `payloads/amiit-platform-architecture.cards.html`  | `e340a28bdaaa1a1ecada293ce1309fe43cb85aad5ce5f29a074252afc64efd03` |
| `payloads/amiit-platform-architecture.guided.json` | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` |
| `payloads/amiit-platform-architecture.meta.json`   | `de6548377ff1a469fc5b37690f1dadf7e33b400af3fad1256f3dc7df6d3d6756` |

## Commodity Trading source receipt

Imported from the source working tree on 2026-09-07. The SVG description and HTML/JSON formatting were adapted. This receipt records the original import. The owner subsequently corrected its topology; the current graph and cards are authored from that clarification.

| Source file                                       | SHA-256                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `assets/commodity-trading-platform.svg`           | `0f563aa190258849aecf66f4d69d7d090fe1cfeafb36a03f56f32226537cdf59` |
| `payloads/commodity-trading-platform.cards.html`  | `45402363066ae5eb33aff47bf423a808e86deb6a02c694c25d48ca3b8aed46a2` |
| `payloads/commodity-trading-platform.guided.json` | `fafe568512bb9c8bc6736abe95ec7972c7943e2aae253ded5a928dc4def7bf35` |
| `payloads/commodity-trading-platform.meta.json`   | `07bc4cbc24e47ecad8cf1883cd8edc4f4f3bbf2de931161f9ade7e58e7022adb` |

## Commodity architecture correction

The owner clarified the flow on 2026-09-07. Trading portal and mobile apps enter zamport; zamport checks authentication with the IDP and routes to the Amiit.ai stack or the custom trading brain. The trading server is the core business logic and IP. Amiit.ai uses zaMCP, which accesses MinIO, ERPNext, and Vikunja. The trading server accesses those three services directly by API.

The focused overview omits the prior messaging clients. Their omission does not assert they are absent from the system. Storage reflects the owner's corrected per-service mapping: zamport and the former standalone zampa node have no attached database in this overview; zaMCP has Redis; IDP, the trading server, and ERPNext retain PostgreSQL from the owner's earlier description. MinIO stores objects directly and has no PostgreSQL dependency. Vikunja has a database node with an unspecified engine pending deployment confirmation. The original blanket PostgreSQL assumption is superseded. Existing `portal` and `identity` identifiers remain stable for links, while their visible labels now read Trading brain and AI personal assistant.

The editable specification is [commodity-trading-platform.architecture.json](diagrams/commodity-trading-platform.architecture.json). Render it with archify, then extract its SVG into the existing payload; preserve the shared runtime and page controls. The browser test checks the complete directed edge set against the owner's description, as well as guided views and responsive controls.

Storage references: [MinIO quickstart](https://github.com/minio/minio/blob/master/README.md#install-from-source) runs against a filesystem path. [Vikunja configuration](https://vikunja.io/docs/config-options/#database) supports SQLite, PostgreSQL, and MySQL/MariaDB, defaulting to SQLite. These product capabilities do not establish the engine used by this deployment.

## Amiit product and storage refinement

Amiit (Agent) is the product's central agentic service and loop. Agentic Memory and zaMCP replace the old visible service names; node IDs remain stable for links. Application requests enter the agent via the public gateway or channel adapters. The direct gateway-to-memory edge is removed. Identity flows remain separate infrastructure concerns.

Bitwarden is the fourth service exposed through zaMCP, alongside Vikunja, Forgejo, and MinIO, and is labeled for secure credentials storage. A separate Redis node is connected to the agent for durable execution state, distinct from the identity tier's existing Redis. Agent ownership is the provisional interpretation of the request, pending clarification. The diagram expresses the storage role; it does not configure Redis persistence. Cards and the complete directed-edge browser assertion reflect these changes.

## Trading platform product boundary

The owner clarified that the commodity diagram's `agent` node represents the full Amiit.ai stack, integrated as this project's AI personal assistant. Its visible label is Amiit.ai with Full AI assistant stack beneath it. The separate Trading brain is a service Arye Zamir built specifically for trading logic and management; it owns the business rules and IP. Supporting internals of the Amiit stack remain detailed in the separate Amiit diagram. Existing node IDs and directed connections remain stable.
