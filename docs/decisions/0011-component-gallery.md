# 0011. Component gallery on mock-preview deploys

- **Status:** accepted
- **Date:** 2026-10-29

## Context

[DIDI-864](https://linear.app/didi-build/issue/DIDI-864) adds a Launchpad-style component gallery to Quorum. Design specs live under `design/` (designer-only). PR previews already upload mock UI via [0010](./0010-mock-preview-deploys.md) (`quorum-preview`, `QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW`).

## Decision

1. **Hosting:** Static React gallery (Vite) built into `frontend/dist-preview/gallery/` with base `/gallery/`. Shipped in the same `wrangler.preview.jsonc` asset upload as the mock app (no separate Worker, no `wrangler preview`, no new secrets).
2. **Registry:** `frontend/src/components/*.gallery.ts` imports app components from `frontend/src/components/`; `frontend/gallery/registry.ts` lists entries. Spec markdown may be imported with `?raw` for display only.
3. **Routes:** Gallery SPA at `/gallery/`; `preview/worker.ts` and the local mock-preview static server serve `gallery/index.html` for HTML navigations under `/gallery/`.
4. **CI:** `npm run check` runs `gallery:guards` and `gallery:build`. `.github/workflows/gallery-preview.yml` runs guards on pull requests. Preview deploy builds gallery assets, probes `/gallery/` after upload, posts the **`gallery-preview`** check, and links `/gallery` in the sticky PR comment.
5. **Config metadata:** `wrangler.gallery.jsonc` documents the gallery asset root (`./frontend/dist-preview`) for guards; production and PR upload continue to use `wrangler.preview.jsonc` only.

## Reasons

- Reuses the existing per-PR mock-preview path and preview token scope (Workers Scripts Edit on `quorum-preview` only).
- Keeps designer specs in `design/` separate from `frontend/src/components/`.
- Matches the DIDI-849 gallery pattern without a second deploy pipeline.

## Consequences

- At least one seeded component (`StatusChip`, spec `design/app/ui-polish/spec.md`) proves the registry.
- Full UI migration into the gallery is out of scope.
- No production behaviour or binding changes; mocks only on previews.
