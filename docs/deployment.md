# Deployment

The production build is a static bundle with no server runtime. It is served by Cloudflare Workers
static assets, published from GitHub Actions on every push to `main`.

## Why not S3 + CloudFront

CloudFront is an origin-plus-CDN architecture, and this application has no origin worth managing. The
SPA history requirement is the deciding difference:

- CloudFront has no native rewrite. Serving `/read` and `/see` requires either a CloudFront Function on
  the viewer-request event, or the widespread `403 -> /index.html` custom-error-response hack that
  returns HTTP 200 for genuinely missing URLs.
- Every release needs an explicit `create-invalidation` call, and invalidation paths are billed past the
  monthly free allowance.
- The ACM certificate must live in `us-east-1` regardless of where the distribution is used, and DNS for
  `zamir.work` is hosted at the registrar rather than Route 53, so validation records are manual.
- The minimum resource set is a bucket, a bucket policy, an origin access control, a distribution, a
  certificate, and an OIDC role — six managed resources for eleven immutable files.

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

## Domain configuration

A Workers custom domain requires the zone to be active on Cloudflare, so `zamir.work` nameservers move
from the registrar to Cloudflare once. Cloudflare then creates and proxies the `arye` record itself when
the custom domain `arye.zamir.work` is attached to the `arye-zamir-work` Worker, and issues the
certificate. No certificate or DNS record is managed in this repository.

Until the zone moves, every deployment is still reachable at the Worker's `workers.dev` hostname.

## Routing contract

`wrangler.jsonc` sets `not_found_handling` to `single-page-application`. Any path that does not match a
built asset is served `index.html` with HTTP 200, and Vue Router resolves the route or renders the
localized catch-all view.

## Local publish

```sh
pnpm build
pnpm dlx wrangler deploy
```
