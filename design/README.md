# Quorum design

Design specs for Quorum (the rebuild of v1 domAIn), laid out by area. Each spec folder has a `spec.md`, rendered `mockups/` and `reference/` source.

## App

| Folder                                 | What it covers                                                                                                                                                                                                                          | Status              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| [app/ui-polish](app/ui-polish/spec.md) | Polished UI for every v1 screen and state: foundations (tokens, mark, layout, error wording), entry (landing, sign in, allowlist, loading), chat, council, write-back card, connections and the add source picker. Same features as v1. | Approved 2026-10-23 |

### app/ui-polish contents

- `spec.md`: purpose, foundations, every screen and state with layout, copy, tokens and the v1 component it replaces, decisions, dropped redesign items, changes.
- `mockups/`: 128 full-height PNGs, `<screen>-<state>-<desktop|mobile>-<dark|light>.png`. Good starting points:
  - `council-result-3-seats-desktop-dark.png`
  - `write-back-plan-shown-desktop-dark.png`
  - `connections-connected-all-states-desktop-dark.png`
  - `add-source-github-repos-desktop-dark.png`
  - `chat-direct-answer-mobile-dark.png`
  - `entry-landing-desktop-dark.png`
- `reference/`: source of the interactive mockups as text (`SpecA.tsx.txt`, `a.css.txt`, `spec.css.txt`, `data.ts.txt`, `specdata.ts.txt`, `icons.tsx.txt`, `proto.css.txt`).
