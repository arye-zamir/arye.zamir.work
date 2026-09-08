# Pending KB and board updates

Written offline because zaMCP is unreachable. Promote each entry into the `devops` bundle concept
`devops/agentic-code-factory` and the `code-factory` board (project 17, card `FACT-1`) when the
connector is re-authorized, then delete this file.

## Concept corrections

1. **Deployment path.** The concept specifies `merge -> GHCR image tagged by commit SHA -> demo Compose
deployment`. The target site now deploys to Cloudflare Workers static assets, tag-gated. The demo
   target is `wrangler versions upload`, which returns a per-version preview URL and needs no registry,
   no Compose, and no VPS.

2. **Runner.** The concept requires a disposable runner on a separate Hetzner VPS. GitHub Actions
   runners are ephemeral and hold no production credentials, satisfying the isolation requirement without
   provisioning. The Hetzner host remains the fallback and is still unprovisioned.

3. **Repository visibility.** The concept assumes one allowlisted private repository. The repository is
   public. Branch protection — which the concept makes the hard gate — is unavailable on a private
   repository on the Free plan, so publishing is what makes the approval gate enforceable at all.

4. **Runtime.** Pi with OpenRouter is accepted, not merely recommended. Pinned models are
   `z-ai/glm-5.3-flash` as default and `z-ai/glm-5.3` as escalation, held in repository variables. Neither
   has been measured against this repository; they are a baseline to test, not a settled choice.

5. **SSH alias.** The factory host alias is `arye-zamir-work`. The dotted form now resolves to
   Cloudflare's edge.

## Correction to record: PAT cannot author the agent pull request

The concept's choice of a GitHub App is load-bearing and was briefly substituted with a personal access
token. That substitution fails. GitHub states that pull request authors cannot approve their own pull
requests, so a pull request opened with an owner-held PAT can never satisfy a one-approval rule — the
factory deadlocks.

Two identities are therefore required and they cannot be the same one:

- The pull request author must not be the owner, so that the owner can approve it.
- The tag push must not use `GITHUB_TOKEN`, because GitHub does not start workflow runs from pushes made
  with it, and the deploy would silently never fire.

A GitHub App installation token satisfies both, which is why the concept named one. `GITHUB_TOKEN` for
authorship plus a PAT for the tag push is the fallback, subject to confirming whether checks run
automatically on a `GITHUB_TOKEN`-authored pull request.

## Applied to the repository

- Branch protection on `main`: required checks `Quality / Node 22.13.0`, `Quality / Node 24`, `Security`,
  `Approved scope`; one approval; stale reviews dismissed; force pushes and deletions refused;
  administrators not enforced, so the owner retains an escape hatch.
- Labels created: `factory:ready`, `factory:running`, `factory:pr-open`, `factory:blocked`,
  `factory:failed`, `factory:verified`, `no-agent`, `security`, `migration`, `production`.
- Secrets `OPENROUTER_API_KEY` and `FACTORY_TOKEN`; variables `FACTORY_MODEL_DEFAULT`,
  `FACTORY_MODEL_ESCALATION`, `FACTORY_BUDGET_USD`.
- `FACTORY_TOKEN` scopes are unverified. It became write-only on transfer and the source was shredded.
  Phase 3 verifies it in CI before anything depends on it.
