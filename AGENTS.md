# Agent instructions

**Project:** Quorum — Group decisions by AI seats that reach a consensus recommendation.

This file is the single source of truth for how agents work in this repository. Other agent entry points only link here.

## Before you write code

1. Read `docs/architecture/` and `docs/decisions/` for this feature.
2. If architecture or an accepted decision is missing, stop and produce a decision or architecture note first. **No implementation before the shape of the feature is decided.**

## Product rules (inherited from v1 domAIn)

These apply to all application code once features land; they are not waived by the Cloudflare port.

- **`user_id` comes from auth context only, never the request body.** See [0008](./docs/decisions/0008-inherited-v1-adr-0004.md).
- **All access checks go through `can_access()`.** See [0008](./docs/decisions/0008-inherited-v1-adr-0004.md).
- **Verdict vocabulary:** `approve`, `request_changes`, `comment` only. See [0007](./docs/decisions/0007-inherited-v1-adr-0003.md).
- **Knowledge source status:** `pending`, `indexing`, `ready`, `error` only. Source types: `github_repo` and `linear` only. **No file upload.** See [0007](./docs/decisions/0007-inherited-v1-adr-0003.md).
- **Unified chat, no mode selector.** The supervisor classifies intent. See [0009](./docs/decisions/0009-inherited-v1-adr-0005.md).
- **Write-back to GitHub happens via pull request**, never direct commits to the default branch. See [0006](./docs/decisions/0006-inherited-v1-adr-0002.md).

## Engineering standards

- Prefer clean, modular boundaries; small extensions over clever hacks; readable names; minimal duplication.
- Follow this repo’s docs and config over your general habits.
- Mark unknowns as unknown. Do not guess requirements or infrastructure.
- Do not add personal data to logs, queues, or tables without updating the data map (`docs/privacy/data-map.yml` when nodrift scaffolding is present).

## Testing

- State which seam a test covers (unit, integration, or broader).
- Pick the seam that gives confidence without bending production code to satisfy weak tests.
- Never weaken production code only to make a test pass.

## Verification

- Run `npm run check`, `npx nodrift check`, and `npm run test:worker` before claiming work is done (CI runs all three on every PR). Do not skip verification after implementation.

## Launchpad attribution

- Do **not** remove the `<!-- launchpad-attribution:start -->` … `<!-- launchpad-attribution:end -->` block in `README.md` or delete `LICENSES/launchpad-MIT.txt` unless the **repository owner** explicitly asks you to.

## Secrets

- Never commit secrets. For the Worker app, copy `.dev.vars.example` to `.dev.vars` locally (never commit `.dev.vars`). Use `.env` only for launchpad-only vars; document **names** in `.env.example` and `.dev.vars.example`.
- Never reference, print, or move `BOOTSTRAP_TOKEN` outside `.github/workflows/bootstrap.yml` (enforced by `npm run secret-usage`).

## Scope and tickets

- The linked Linear ticket is the source of truth for scope.
- Read-only or decision-only tasks: no code, no branches, no PR — post the answer where the ticket asks.

## Pull requests

- Keep PRs small and link the Linear ticket.
- Describe what changed, why, and how you verified (include `npm run check`).
- **Open a PR and wait for human review.** Do not merge your own PR unless the ticket explicitly says **merge when green**.
- **Dependabot** dependency PRs are the exception: when CI passes, [Dependabot auto-merge](./.github/workflows/dependabot-automerge.yml) may merge them without a human review. Set repo variable `DEPENDABOT_AUTOMERGE=false` to disable.

## Commands

| Script                                | Purpose                                                                                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                         | Build the PWA and start the Worker locally (`wrangler dev`); `GET /health` returns `{"status":"ok"}`                                                                                                             |
| `npm run build`                       | Production build of the Vite frontend into `frontend/dist`                                                                                                                                                       |
| `npm run build:frontend`              | Same as `build` (frontend only)                                                                                                                                                                                  |
| `npm run build:frontend:mock-preview` | Production build with mock-preview Vite mode (PR previews, no service worker)                                                                                                                                    |
| `npm run capture-preview-screenshots` | Playwright screenshots of mock-preview routes (local static server or `PREVIEW_BASE_URL`)                                                                                                                        |
| `npm run check`                       | Launchpad gate: conflict markers, format, lint, typecheck, unit tests, secret scan, placeholders, attribution, and `npm run nodrift` (CI also runs explicit `npx nodrift check` and `npm run test:worker` steps) |
| `npm run test:worker`                 | Vitest with `@cloudflare/vitest-pool-workers` (Worker integration tests under `test/worker/`)                                                                                                                    |
| `npm run nodrift`                     | `@didi-build/nodrift check` when `.nodrift/manifest.json` or `docs/privacy/data-map.yml` exists; skipped otherwise                                                                                               |
| `npm run lint`                        | ESLint                                                                                                                                                                                                           |
| `npm run format`                      | Prettier write                                                                                                                                                                                                   |
| `npm run format:check`                | Prettier check                                                                                                                                                                                                   |
| `npm run typecheck`                   | `tsc --noEmit`                                                                                                                                                                                                   |
| `npm run test`                        | Vitest (CI uses JUnit output)                                                                                                                                                                                    |
| `npm run secrets`                     | Secretlint                                                                                                                                                                                                       |
| `npm run secret-usage`                | Fail if `BOOTSTRAP_TOKEN` appears outside `bootstrap.yml` workflows                                                                                                                                              |
| `npm run init-project`                | Replace `{{…}}` placeholders; optionally run `nodrift init` when the project collects personal data                                                                                                              |
| `npm run repo-settings`               | Dry-run, `--apply`, or `--verify` recommended GitHub repo settings                                                                                                                                               |
| `npm run verify-action-pins`          | Verify each pinned action SHA matches its version comment (`# vX.Y.Z`)                                                                                                                                           |
