# Deployment

The production build is a static bundle with no server runtime. It is served by Cloudflare Workers
static assets, published from GitHub Actions when a release tag is pushed.

## Release flow

`ci.yml` is the only entrypoint. It runs on pull requests, on pushes to `main`, and on `v*.*.*` tags.
The `deploy` job is a gated call into `deploy.yml`:

- It is guarded by `if: startsWith(github.ref, 'refs/tags/')`, so branch pushes never publish.
- It declares `needs: [quality, security]`, so a tag that fails formatting, linting, unit contracts,
  the typed Vue build, or the dependency audit does not reach Cloudflare.
- The `quality` job uploads `dist` as the `release-bundle` artifact on its Node 24 leg, and the deploy
  job downloads that artifact instead of rebuilding. The published bytes are the bytes that passed the
  gate, and no check runs twice.

Cutting a release:

```sh
git tag -a v1.0.0 -m "v1.0.0"
git push origin v1.0.0
```

`VITE_APP_VERSION` is resolved during the gate: the tag name on a tag build, the short commit SHA
otherwise. The footer omits the version when no value is supplied.

## Concurrency

```yaml
cancel-in-progress: ${{ github.event_name == 'pull_request' || startsWith(github.ref, 'refs/tags/') }}
group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}
```

The group is keyed by commit SHA rather than by ref, so the `main` push and the tag that follows it
collide instead of running the same gate twice. The tag run cancels the redundant branch run and
proceeds to deploy. Pushes to `main` do not cancel each other, because each carries a distinct SHA and
every commit on the default branch is worth gating on its own.

## Why not S3 + CloudFront

CloudFront is an origin-plus-CDN architecture, and this application has no origin worth managing. The
SPA history requirement is the deciding difference:

- CloudFront has no native rewrite. Serving `/read` and `/see` requires either a CloudFront Function on
  the viewer-request event, or the widespread `403 -> /index.html` custom-error-response hack that
  returns HTTP 200 for genuinely missing URLs.
- Every release needs an explicit `create-invalidation` call, and invalidation paths are billed past the
  monthly free allowance.
- The ACM certificate must live in `us-east-1` regardless of where the distribution is used.
- The minimum resource set is a bucket, a bucket policy, an origin access control, a distribution, a
  certificate, and an OIDC role.

Cloudflare Workers static assets replaces all of that with `not_found_handling` and an upload. Assets
are versioned per deployment, so there is no cache invalidation step.

GitHub Pages was rejected for the same routing reason: its only SPA fallback is a `404.html` copy of
`index.html`, which is still served with an HTTP 404 status and is therefore unusable for indexed
routes.

## Repository configuration

The `Deploy` workflow reads two repository secrets:

| Secret                  | Source                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard, Workers & Pages overview                         |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with the `Edit Cloudflare Workers` template scope |

The token must be scoped to the account **and** to the `zamir.work` zone. The zone grant carries
`Workers Routes: Edit`, which is what attaches the custom domain. An account ID belonging to a
different account than the token produces `Authentication error [code: 10000]` rather than a 404.

## Domain configuration

`zamir.work` is delegated to `alaric.ns.cloudflare.com` and `rosemary.ns.cloudflare.com`. The zone must
be active on Cloudflare for a Workers custom domain to attach.

`wrangler.jsonc` declares the custom domain, so the first successful deploy creates the `arye` record
and issues the certificate. No DNS record or certificate is managed by hand.

Namecheap email forwarding does not survive the nameserver move; the imported `eforward*` MX records
resolve but the service behind them no longer accepts the domain. Cloudflare Email Routing is the
replacement and writes its own MX and SPF records.

## Routing contract

`wrangler.jsonc` sets `not_found_handling` to `single-page-application`. Any path that does not match a
built asset is served `index.html` with HTTP 200, and Vue Router resolves the route or renders the
localized catch-all view.

```sh
curl -sI https://arye.zamir.work/see | head -1
```

That must return `HTTP/2 200` on a path that is not a file on disk.

## Local publish

```sh
pnpm build
pnpm dlx wrangler deploy
```
