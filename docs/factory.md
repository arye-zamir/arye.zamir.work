# Code factory — work plan

Implements the `devops/agentic-code-factory` architecture against this repository. That concept is the
design authority; this file records the sequencing and the deltas that supersede it.

## Deltas from the KB concept

The concept was written 2026-09-07, before this site had a deployment. Four of its premises changed.

| Concept says                                       | Now                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `merge -> GHCR image -> demo Compose deployment`   | Cloudflare Workers; `wrangler versions upload` yields a per-version preview |
| Disposable runner on a separate Hetzner VPS        | GitHub Actions runners — ephemeral, credential-free, no provisioning        |
| One private repository, allowlisted                | Public repository, owner-only trigger                                       |
| Pi is "a recommendation, not an accepted decision" | Pi with OpenRouter is the accepted runtime                                  |

The Hetzner host remains unprovisioned: ARM64, 3.7 GiB, no swap, no Docker or Node on the login PATH,
and `sudo -n` refuses non-interactive authentication. It is the fallback if Actions minutes ever bind.

The SSH alias is `arye-zamir-work`. The dotted form now resolves to Cloudflare's edge.

## Phases

**1 — Publishable repository.** Untrack `.env.development` and ignore the `.env*` pattern, keeping the
development default in configuration instead. Resolve whether the bundled client architecture payloads
may stay public; they already ship inside `dist/assets/*DiagramView-*.js`, so the repository is not what
exposes them. Then flip the repository public, which makes Actions minutes free and unlimited.

**2 — Target contract.** The input the concept names as blocking. Mark one representative element with
`data-factt`, and write the trusted edit policy: a mapping from each marker value to its permitted source
locations and change categories, plus the permitted translation catalog, keys, and locales. The policy
lives on the protected base revision.

**3 — Agent step.** Attach pi to the eligibility gate. Two pinned model IDs, a default and an escalation.
The issue body reaches the agent as a file, never interpolated into a shell line. An aggregate token
budget and a wall-clock limit bound the run. Output is a branch `agent/<issue>-<slug>` and a pull request
that references the issue without closing keywords.

**4 — Scope enforcement.** A check that diffs the pull request against the policy and fails on any path
outside the approved mapping, including the policy file itself and `.github/`. It runs from the base
revision, so the patch cannot alter its own gate.

**5 — Demo deployment.** `wrangler versions upload` on the branch, preview URL posted to the pull request.
Production stays tag-only and the agent never creates tags.

**6 — Release.** On an owner approval, merge, derive the semver bump, and push the tag. The tag push needs
a personal access token or GitHub App token: a tag pushed with `GITHUB_TOKEN` does not trigger the deploy
workflow.

**7 — Verification and showcase.** Assert the deployed version and the requested change over HTTP, then
surface it on the site as the concept's third homepage candidate — a release badge opening a receipt of
the run: change summary, model, cost, duration, commit identity, and verification status, read from a
sanitized artifact. Mirror status to Vikunja through zaMCP.

## Owner inputs

| Input                                     | Blocks phase |
| ----------------------------------------- | ------------ |
| Flip the repository public                | 1            |
| NDA decision on the architecture payloads | 1            |
| `OPENROUTER_API_KEY` repository secret    | 3            |
| Pinned model IDs and the spend ceiling    | 3            |
| `FACTORY_TOKEN` with `contents: write`    | 6            |
| zaMCP re-authorization                    | 7            |

## Trigger

`.github/workflows/factory.yml` admits an issue only when the `factory:ready` label is applied, the issue
author and the labelling actor are both the repository owner, `author_association` is `OWNER`, and no
`no-agent`, `security`, `migration`, or `production` label is present. The expression is re-asserted in
shell inside the job so a malformed guard fails closed.

Owner authorship makes the issue text non-hostile. It does not make it trusted: titles, bodies, labels,
and branch names stay out of shell interpolation.
