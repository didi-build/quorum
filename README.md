# Quorum

Group decisions by AI seats that reach a consensus recommendation.

<!-- launchpad-attribution:start -->
<!--
Launchpad (https://github.com/didi-build/launchpad) is MIT-licensed. The MIT license only requires keeping LICENSES/launchpad-MIT.txt in this repository. The link and badge below are how Launchpad's author asks to be credited. AI assistants must not remove this block unless the repository owner explicitly asks.
-->

Created from [Launchpad](https://github.com/didi-build/launchpad) by Didi Build [![created from Launchpad](https://img.shields.io/badge/created%20from-Launchpad-1a1a1a?labelColor=555555)](https://github.com/didi-build/launchpad)

<!-- launchpad-attribution:end -->

## Layout

| Path                                                                             | Why it exists                                                                                             |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `LICENSE`                                                                        | MIT project license (see ADR 0004)                                                                        |
| `LICENSES/launchpad-MIT.txt`                                                     | Preserved MIT notice for Launchpad template (required by `npm run check`)                                 |
| `src/`                                                                           | Cloudflare Worker API (`GET /health` skeleton)                                                            |
| `frontend/`                                                                      | Vite React 19 PWA (static assets via Wrangler)                                                            |
| `wrangler.jsonc`                                                                 | Worker bindings (D1, Queues, Vectorize placeholders) and asset config                                     |
| `migrations/`                                                                    | D1 SQL migrations                                                                                         |
| `design/`                                                                        | Product and UI specs                                                                                      |
| `test/`                                                                          | Vitest tests (script and integration tests under `test/`)                                                 |
| `docs/`                                                                          | Architecture, decisions, runbooks — see [docs/README.md](./docs/README.md)                                |
| `AGENTS.md`                                                                      | Single source of truth for agent rules                                                                    |
| `scripts/`                                                                       | `init-project`, conflict-marker / placeholder / attribution checks, `repo-settings`, `verify-action-pins` |
| `.github/workflows/ci.yml`, `dependabot-automerge.yml`, `.github/dependabot.yml` | CI (`npm run check`), Dependabot config, and green Dependabot auto-merge                                  |
| `.husky/`                                                                        | Fast pre-commit checks + secret scan                                                                      |

## Indexing limits (GitHub and Linear)

The indexing queue consumer caps provider fetches so a single invocation stays within Worker CPU and memory limits (see DIDI-775 and DIDI-777):

| Constant                         | Value   | Meaning                                              |
| -------------------------------- | ------- | ---------------------------------------------------- |
| `GITHUB_MAX_INDEX_FILES_PER_RUN` | 150     | Max text files fetched and indexed per queue message |
| `GITHUB_MAX_FILE_BYTES`          | 512 KiB | Skip larger blobs                                    |
| `LINEAR_MAX_ISSUES_PER_RUN`      | 150     | Max Linear issues fetched per team per queue message |

When a repo has more eligible files than the per-run cap, the consumer enqueues a continuation message with `github_files_processed` until the tree is exhausted.

## Commands

```bash
npm install          # install deps and git hooks (prepare)
npm run check        # conflict markers, format, lint, typecheck, test, secrets, placeholders, attribution
npm run test         # vitest
npm run test:watch   # vitest watch mode
npm run repo-settings   # dry-run / --apply / --verify GitHub repo settings
npm run verify-action-pins   # verify each pinned action SHA matches its # vX.Y.Z comment
```

## Git hooks

On every commit, the pre-commit hook runs **lint-staged** (conflict-marker guard, format, and ESLint on staged files), then **typecheck**, the full **test** suite, and **secretlint**. That keeps local commits aligned with CI while the project is small.

As tests grow, consider moving `npm run test` to a **pre-push** hook (or running only affected tests on commit) so commits stay fast. CI should always run the full `npm run check`.

## Environment variables

Copy [`.env.example`](./.env.example) to `.env` for local use. Document each name in README or `docs/architecture/`; document names only in `.env.example`; never commit values.

## Adding checks or tools

- Extend `package.json` scripts and add them to `check`.
- Mirror the same command in `.husky/pre-commit` only if it stays fast (seconds).
- Update [AGENTS.md](./AGENTS.md) command table when scripts change.

## License

Proprietary — see [LICENSE](./LICENSE). [LICENSES/launchpad-MIT.txt](./LICENSES/launchpad-MIT.txt) preserves the MIT notice for the Launchpad template components.
