# Component gallery

Quorum includes a **component gallery** at `/gallery/` on the same **mock-preview** Worker alias as the app (`quorum-preview`, alias `pr-<number>`). It renders registered components with variants for PR review and the design workflow.

## Who edits what

| Role          | `design/<area>/<feature>/spec.md` (design specs) | `frontend/src/components/` (app components) | `*.gallery.ts` (gallery registry metadata) |
| ------------- | ------------------------------------------------ | ------------------------------------------- | ------------------------------------------ |
| **Designer**  | Create and update specs (Diadem approves).       | Do not edit for gallery-only work.          | Add gallery entries from approved specs.   |
| **Developer** | Do not edit.                                     | Integrate approved UI; no spec edits.       | Wire variants and props only.              |
| **QA**        | Read specs                                       | Verify app behavior separately.             | Verify gallery matches approved spec.      |

**The `design/` tree is designer-only.** Developers do not edit specs. Gallery metadata may import spec markdown at build time for display in the gallery only.

## Layout

| Path                                   | Purpose                                                  |
| -------------------------------------- | -------------------------------------------------------- |
| `design/<area>/<feature>/spec.md`      | Designer-owned specs                                     |
| `frontend/src/components/`             | Production React components                              |
| `frontend/src/components/*.gallery.ts` | Gallery metadata (variants, props, spec link)            |
| `frontend/gallery/`                    | Gallery SPA (registry shell, layout); not the app routes |

## Add a component

1. Designer adds or updates an approved spec under `design/<area>/<feature>/spec.md`.
2. Add `frontend/src/components/<Name>.gallery.ts` that imports the component from the same directory (no duplicated implementation).
3. Register it in `frontend/gallery/registry.ts`.
4. Run `npm run gallery:build` and open `/gallery/` locally with `npm run dev:gallery` or on a PR mock-preview URL.

## Local development

```bash
npm run dev:gallery      # Vite dev server; open /gallery/
npm run gallery:build    # static assets under frontend/dist-preview/gallery/
npm run gallery:guards   # fail-closed CI guards (also in npm run check)
```

Mock-preview builds (`npm run build:frontend:mock-preview`) run `gallery:build` after the app bundle so PR uploads include `/gallery/`.

## PR gallery preview

Same-repo pull requests run **Preview deploy** (`.github/workflows/preview.yml`), which uploads `frontend/dist-preview` (app at `/app/` plus gallery at `/gallery/`) via `wrangler versions upload` and `QUORUM_CLOUDFLARE_API_TOKEN_PREVIEW`. The sticky PR comment links the app preview URL and `/gallery`. A **`gallery-preview`** GitHub Check is posted when the deploy probe passes.

**Gallery preview** (`.github/workflows/gallery-preview.yml`) runs `npm run gallery:guards` on every pull request.

On `workers.dev` preview aliases, Cloudflare may add `X-Robots-Tag: noindex` without `nofollow`; the gallery HTML includes `<meta name="robots" content="noindex, nofollow" />`, which CI probes on deployed previews.

See [ADR 0011](./decisions/0011-component-gallery.md).
