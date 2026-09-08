# arye.zamir.work

Bilingual portfolio and writing platform for frontend architect Arye Zamir. The application is a Vue 3 single-page application with typed route metadata, route-level code splitting, English and Hebrew localization, automatic RTL direction, and accessible navigation lifecycle management.

## Architecture

- `src/main.ts` is the composition entrypoint.
- `src/internal/boot.ts` installs infrastructure plugins before mounting Vue.
- `src/internal/router.ts` owns route paths, names, localized metadata keys, lazy boundaries, scroll restoration, and the catch-all route.
- `src/internal/i18n.ts` derives a compile-time message-key union from English and requires structural parity from the Hebrew catalog.
- `src/internal/content.ts` models one canonical original-language record with optional translations and deterministic fallback.
- `src/app/composables/useDocumentContext.ts` synchronizes locale direction, document metadata, and route focus.
- `src/app/views/` contains route-owned presentation; shared shell behavior remains in `src/app/App.vue`.
- `src/static/style.css` contains the design tokens and responsive, logical-property-based layout system.

## Quality Gate

```sh
pnpm check
```

The gate checks Prettier formatting, ESLint with zero warnings, typed unit contracts, Vue template types, and the production Vite bundle. ESLint uses type-aware `strict-type-checked` and `stylistic-type-checked` rules, Vue's all-error recommended flat preset, and Perfectionist's natural-order preset. Prettier owns formatting.

CI runs those stages independently on Node 22.13 and 24. A separate networked security job audits every production vulnerability severity and high-severity development vulnerabilities; pull requests also receive dependency-diff review. Workflow actions are pinned to immutable release commits and run with read-only repository permissions.

## Development

The first interactive architecture diagram is available at `/see/alektions-election-events-map`.
See [the integration notes](docs/architecture-diagram.md) for its source, lifecycle contracts, and browser checks.

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

```sh
pnpm install
pnpm dev
```

`VITE_APP_VERSION` is optional. Development can define it in `.env.development`; production pipelines can inject a release identifier. The footer omits the version when no value is supplied.

## Deployment

The application uses HTML5 history. The production host must rewrite unknown paths such as `/read` and `/see` to `index.html`; Vue Router then resolves the route or renders the localized catch-all view.

`wrangler.jsonc` satisfies that contract with Cloudflare Workers static assets, and the `Deploy` workflow runs the quality gate and publishes the bundle on every push to `main`.
See [the deployment notes](docs/deployment.md) for the required secrets, the domain move, and why S3 with CloudFront was rejected.
