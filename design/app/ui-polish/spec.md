# Quorum UI polish

Status: approved by Diadem on 2026-10-23 (variant A, "Redesign refined").

## Purpose

One polished design for Quorum, covering every screen and state that v1 (domAIn) already has. Quorum is the rebuild of v1 under a new name, in `didi-build/quorum`. Same features, same data, no product changes. It is the reference for the frontend rebuild and the portfolio write-up. Every screen below maps to the v1 component it replaces under `frontend/src/components/` in v1 (domAIn), `DiademShoukralla/domAIn`.

Sources it builds on:

- v1's approved but unbuilt redesign, `docs/design/domAIn-redesign.dc.html` (screens 1a to 1t), refined into variant A.
- v1's design system, `docs/business/design-system/` (`tokens.css`, `components/bundle.css`).
- v1's types and copy: `frontend/src/types/chat.ts`, `frontend/src/types/sources.ts`, `frontend/src/lib/statusLabels.ts`, `frontend/src/lib/writeBackPlan.ts`, `frontend/src/lib/authErrors.ts`, `src/domain/schemas/available_sources.py`.

Rule for the whole spec: only data v1 provides. Anything in 1a to 1t that needs new backend data is dropped or shown without it (see "Dropped from the redesign").

## How to read this folder

- `spec.md`: this file.
- `mockups/`: full-height PNG renders of every state, named `<screen>-<state>-<desktop|mobile>-<dark|light>.png`. Desktop renders are 1280px wide, mobile renders 380px wide, both at 2x.
- `reference/`: the source of the interactive mockups as text files (`SpecA.tsx.txt` renders every state from a state id; `a.css.txt` and `spec.css.txt` hold every token and component style). Treat them as a visual reference, not production code.
- The same states are interactive in MagicPath, project "DIDI-768 domAIn UI polish" (the project keeps its original name; the MagicPath tools cannot rename it): one frame per screen group with a state switcher, desktop and 380px, dark and light.

## Foundations

### Tokens

Warm neutrals with one amber accent. Dark is the default; light follows the operating system setting (`prefers-color-scheme`). There is no in-app theme switch in v1.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#141210` | `#FAF8F5` | Page background, code blocks inside cards |
| `--sf` | `#1C1A17` | `#FFFFFF` | Cards, seat cards, composer, dialogs, menus |
| `--sf2` | `#26231F` | `#F2EEE8` | User bubble, nav track, avatar, comment verdict |
| `--bd` | `#34302A` | `#E5DFD6` | Control borders (inputs, secondary buttons, menus) |
| `--bd2` | `#2A2723` | `#EEE9E1` | Card borders, row dividers, bar border |
| `--fg` | `#F3EFE9` | `#1D1A16` | Primary text |
| `--mu` | `#A8A095` | `#6A6258` | Secondary text, captions, status lines |
| `--mu2` | `#7D766C` | `#8A8277` | Line numbers, idle dots |
| `--ac` | `#F0A24B` | `#EC9A45` | Primary buttons, send, focus ring, selected checkbox, live pulse |
| `--acfg` | `#1B1206` | `#1B1206` | Text on `--ac` |
| `--act` | `#F5B56E` | `#A4560C` | Accent text and links, chair overline |
| `--acs` | accent at 12% | accent at 13% | Chair block fill, selected picker row, focus halo |
| `--acb` | accent at 34% | accent at 45% | Chair block border and divider |
| `--ok` / `--oks` | `#72C493` | `#2F8A55` | Ready, Approve, success; `--oks` is its 10 to 13% fill |
| `--er` / `--ers` | `#F08E7E` | `#C2412F` | Errors, Request changes, Remove; `--ers` is its 8 to 12% fill |
| `--ux` `--dx` `--biz` | `#E3A0A8` `#9FB1EC` `#C8C97A` | `#9A4F58` `#40569E` `#6F6A24` | Seat marks for UX, Dev experience, Business |

The chair block is the only amber surface on any screen. Amber elsewhere is limited to buttons, focus, selection and links.

Type: Geist for text, Geist Mono for paths, overlines and code.

| Style | Spec | Used for |
|---|---|---|
| Display | 40/44 (52/56 on landing desktop), 600, -0.02em | Landing headline |
| Title | 20 to 24 / 28 to 30, 600 | Auth cards, empty states, dialog title (19/26) |
| Body | 15/23, 400 | Default text; chair synthesis 16/25 |
| Small | 13/19 | Captions, status lines, hints |
| Mono | 11.5 to 14 / 16 to 20 | Source names, citation paths, code |
| Overline | 11/16 Geist Mono, uppercase, 0.08em | Section labels, "Chair's recommendation" |

Shape: radius 8 (small buttons), 10 (buttons, inputs, code blocks), 14 (cards), 16 (chair, composer), 18 (dialogs, auth card). Spacing on a 4px grid. Page gutter 24px desktop, 14px mobile. Thread max width 980px. Buttons are 36px (30px small); touch targets on mobile are at least 40px.

Mockups: `foundations-tokens-desktop-dark.png`, `foundations-tokens-desktop-light.png`, `foundations-tokens-mobile-dark.png`.

### App mark and wordmark

Mark: three seats over one bar, on an amber tile (`--ac` tile, `--acfg` glyph). Same glyph as v1 (domAIn). It never depended on the old name (no "AI" letterforms), so it carries over unchanged; three seats over one bar reads as a quorum reaching one decision. Sizes 16, 24, 32, 48, 96.

Wordmark: "Quorum" in Geist 600, title case, tracking -0.025em, 16/20 in the top bar next to a 26px tile with a 10px gap. One word, no inner capitals, no accent colour, no custom letterforms. v1's "Quorum" relied on the capital "AI" inside a lowercase word; Quorum has no such device, so the lockup stays plain and the amber tile carries the brand colour. In the app bar the wordmark hides below 640px and the tile stands alone; the landing page and the lockup specimen always show it.

Replaces: `DomMark.tsx` (same drawing, colours moved to tokens) and the "Quorum" text next to it.

Mockups: `foundations-app-mark-desktop-dark.png`, `foundations-app-mark-mobile-dark.png`.

### Layout and navigation

- One top bar on every signed-in screen: mark on the left, a segmented Chat / Connections switch in the centre, the avatar on the right. The switch is the only place the section name appears (v1's "domAIn / Chat" heading is removed).
- Bar: 60px desktop, 56px mobile, sticky, `--bg` at 88% with blur, `--bd2` bottom border. Switch track `--sf2`, active segment `--sf` with a soft shadow.
- Avatar opens the account menu (see Connections, account menu).
- Chat is a fixed-height app shell: the thread scrolls inside, the composer dock stays pinned at the bottom. On load the thread scrolls to the newest message.
- Connections is a normal scrolling page, max width 860px.

Replaces: the header markup in `ChatApp.tsx` and `ConnectionsView.tsx`, the `SignOutButton.tsx` placement, and the shell in `AppShell.tsx`.

Mockups: `foundations-layout-and-nav-desktop-dark.png`, `foundations-layout-and-nav-mobile-dark.png`.

### Error wording

Raw API errors never reach the screen (v1 shows `detail` text and "Request failed with status N"). Each status maps to one sentence and one next step, shown where the action failed: inside the card, on the row, or in the composer strip. Style: `callout-err` (fill `--ers`, 3px `--er` left rule, text `--fg`).

| Status | Copy | Next step |
|---|---|---|
| 401 session ended | Your session has ended. Sign in again to keep going. | Sign in again (goes to Sign in) |
| 403 access lost | Quorum can't read didi-build/legacy-api anymore. Give it access in GitHub, then refresh. When the API does not name the source: "Quorum lost access to this source." | Check GitHub access |
| 429 rate limited | GitHub asked Quorum to slow down. Wait a minute, then try again. ("Linear" when the provider is Linear.) | Try again (no automatic retry) |
| 5xx and anything unmapped | Something went wrong on our side. Try again in a moment. | Try again |

Replaces: `frontend/src/lib/authErrors.ts` (`humanizeApiError`) and every place that renders `error` text in `ChatApp.tsx`, `ConnectionsView.tsx`, `WriteBackCard.tsx`, `NotAllowedScreen.tsx`, `hooks/useChatWebSocket.ts`.

Mockups: `foundations-error-wording-desktop-dark.png`, `foundations-error-wording-desktop-light.png`, `foundations-error-wording-mobile-dark.png`.

## Entry

### Landing `/`

Layout: bar with mark and "Open app" (secondary); hero with overline "Decision council for your codebase", display headline, lede, "Open Quorum" (primary) and "See how it works" (quiet); a static example of a council result (question, three seats with verdict badges, a chair line on the amber surface); three numbered steps; footer with the health indicator on the left and "quorum.didi.build" on the right. Mobile stacks everything, buttons share the row.

Copy:

- Headline: "Three seats debate. One recommendation ships."
- Lede: "Quorum reads your GitHub repos and Linear team. Ask a quick question and get an answer with sources. Ask a hard one and three seats weigh in, then a chair gives you one recommendation you can write back as a pull request and an issue."
- Steps: "Connect your sources: Pick the repos and Linear teams Quorum can read." / "Ask in one chat: Quick questions get a direct answer. Big decisions go to the council." / "Write it back: Review the plan, refine it, and Quorum opens the pull request and the issue."

Health indicator (replaces v1's "API health" button that opened raw JSON): a quiet line driven by `GET /health`, never a link.

- `{"status": "ok"}`: green dot, "All systems operational".
- Request fails or any other answer: `--er` dot, "Quorum is having trouble right now".

Replaces: `deploy/landing/index.html` and `deploy/landing/style.css` (not a React component in v1).

Mockups: `entry-landing-desktop-dark.png`, `entry-landing-desktop-light.png`, `entry-landing-mobile-dark.png`, `entry-landing-mobile-light.png`, `entry-landing-health-down-desktop-dark.png`, `entry-landing-health-down-mobile-dark.png`.

### Sign in

Layout: centred 400px auth card (`--sf`, radius 18), mark 44px, title, lede, full-width GitHub button (`--fg` fill, `--bg` text, GitHub mark). Below the card: "Back to quorum.didi.build".

Copy: "Sign in to Quorum" / "Quorum is private for now. Use the GitHub account I've invited." / button "Sign in with GitHub"; while redirecting the button is disabled with a spinner and reads "Taking you to GitHub".

Replaces: `SignInScreen.tsx`.

Mockups: `entry-sign-in-*`, `entry-sign-in-redirecting-*`.

### Not on the allowlist

Layout: same auth card. An identity chip at the top (`--sf2`, avatar initials, "Signed in as @sam-rivera"), title, lede, primary "Request access" (prefilled email, as v1), secondary "Use a different account" (opens GitHub sign-out in a new tab), hint below. No red and no error icon.

Copy: "You're not on the list yet" / "Quorum is invite-only while I build it. If you'd like to try it, send me your GitHub username and I'll add you." / "Sign out of GitHub first in the new tab, then try again."

Load failed: if the account cannot be loaded, the same auth card shows the mark, the title "We couldn't check your access", an error callout with the 5xx sentence ("Something went wrong on our side. Try again in a moment.") and one primary button "Try signing in again" that goes back to Sign in. No raw error text.

Replaces: `NotAllowedScreen.tsx`.

Mockups: `entry-not-on-allowlist-desktop-dark.png`, `entry-not-on-allowlist-desktop-light.png`, `entry-not-on-allowlist-mobile-dark.png`, `entry-not-on-allowlist-mobile-light.png`, `entry-not-on-allowlist-load-failed-desktop-dark.png`, `entry-not-on-allowlist-load-failed-mobile-dark.png`.

### Loading

Centred 40px mark with a small spinner and "Loading" in `--mu`. Used while `AppShell` resolves the session and while `NotAllowedScreen` loads the login. No ellipsis character in copy.

Replaces: the loading branch in `AppShell.tsx` and `NotAllowedScreen.tsx`.

Mockups: `entry-loading-desktop-dark.png`, `entry-loading-mobile-dark.png`.

## Chat

Shared layout: top bar; thread (max 980px, 32px top padding, 22px gap); dock pinned at the bottom with a one-line status above the composer.

- User message: right-aligned bubble, `--sf2`, radius 16 16 4 16, max 560px.
- Quorum label: 18px mark, "Quorum", and the route in `--mu` ("Direct answer", "Council review", "Linear request"), from `response_kind`.
- Composer: `--sf`, `--bd` border, radius 16, shadow; textarea grows to 4 lines; Enter sends, Shift and Enter adds a line; amber 36px send button with an arrow. There is no mode selector. Placeholder: "Ask a question or submit a proposal for review" (desktop), "Ask a question" (mobile). Disabled while a reply is in flight or the socket is not open, placeholder "Quorum is answering" while waiting.
- Status line above the composer: green dot and "Answering from N sources" (N is the ready source count v1 already fetches; links to Connections). Replaced by the connection strip when the socket is not open.

Replaces: `ChatApp.tsx` (shell, dock, error line), `ChatThread.tsx`, `ChatMessage.tsx` (user, direct and `Composer`), `CodeCitation.tsx`.

### No sources yet

Centred empty state: 40px mark, "Connect a source to start", "Quorum answers from your code and issues, so it needs something to read first. Most repos are ready in a few minutes.", two cards (GitHub "Repositories you choose", Linear "Your team's issues", each with "Connect") that go to Connections, and "Go to Connections". The composer stays available (v1 still answers greetings) and the status line reads "No sources yet. Add one in Connections".

Mockups: `chat-no-sources-yet-desktop-dark.png`, `chat-no-sources-yet-desktop-light.png`, `chat-no-sources-yet-mobile-dark.png`, `chat-no-sources-yet-mobile-light.png`.

### Loading history and empty thread

- Loading: spinner and "Loading chat history", then skeleton bubbles (`--sf2` shimmer). Mockups: `chat-loading-history-*`.
- Sources ready, no messages: "Ask about your code, issues or a decision" / "Quick questions get a direct answer with sources. Proposals and hard calls go to the council: three seats review it, then the chair recommends." Mockups: `chat-ready-empty-*`.

### Direct answer with code citations

Answer text at 15.5/25, max 760px. Below it an overline "Sources" and one citation per `Citation`: a collapsed row (`--bg` fill, `--bd2` border, radius 10) with a chevron, the path without the `didi-build/` prefix, and the line range `L56:59`; expanded it shows numbered lines in Geist Mono with the first line highlighted in `--acs`. The first citation opens by default.

Mockups: `chat-direct-answer-desktop-dark.png`, `chat-direct-answer-desktop-light.png`, `chat-direct-answer-mobile-dark.png`, `chat-direct-answer-mobile-light.png`.

### Nothing found

Same layout as a direct answer with no Sources block. Text is the API content ("I could not find indexed knowledge that answers that question yet. Try connecting a source or rephrasing the query."), followed by a secondary "Open Connections" button.

Mockups: `chat-nothing-found-desktop-dark.png`, `chat-nothing-found-mobile-dark.png`.

### Stub reply for Linear intents

For `response_kind: stub_not_implemented` the route reads "Linear request" and the reply is a dashed note with the Linear mark: "Linear actions from chat aren't available yet" / "Quorum understood this as a Linear request. For now, ask about your code, issues or a decision." The API content ("Linear read request identified, not yet implemented.") is not shown.

Mockups: `chat-linear-stub-desktop-dark.png`, `chat-linear-stub-mobile-dark.png`.

### Connection states

v1 opens one WebSocket and has no auto-reconnect. The strip above the composer shows the socket state; the composer is disabled unless connected.

- Connecting: spinner and "Connecting live updates". Mockups: `chat-connecting-*`.
- Connected: no strip, the normal "Answering from N sources" line.
- Closed or failed: `--ers` strip, "Live updates stopped. Refresh the page to reconnect." and a secondary "Refresh" button that reloads the page. Mockups: `chat-closed-or-failed-*`.
- Send failed (any error while sending): the user message stays, the pending reply is removed (v1 behaviour) and the strip shows the mapped sentence with a dismiss button. Mockups: `chat-send-failed-*`.

## Council

### In progress

Optimistic first state: before the first status frame, show only the Quorum label and a pulsing amber dot with "Understanding the message" (v1 `OPTIMISTIC_STATUS`). Seat cards appear when the supervisor reports the first council status. This avoids drawing council seats for messages that turn into a direct answer.

Then, under the "Council review" label:

- Supervisor line: pulsing amber dot and the supervisor label: "Alerting council", "Waiting on council", "Council deliberating" (from `statusLabels.ts`).
- Seat grid (same responsive grid as the result): dashed `--bd` border cards with the seat mark and name, a status line and three skeleton lines. Status line per seat: grey ring and "Waiting" (no status yet), pulsing dot and "Pondering", "Researching" or "Giving recommendation", green check and "Recommendation ready" (card border turns solid). No per-seat activity text, no timer, no Stop.
- Mobile: each seat is one row with mark, name and status; no skeleton.

The composer is disabled and reads "Quorum is answering".

Mockups (all seven v1 statuses plus the optimistic one): `council-understanding-*`, `council-alerting-*` (all seats Waiting), `council-waiting-*` (Pondering, Researching), `council-deliberating-desktop-dark.png`, `council-deliberating-desktop-light.png`, `council-deliberating-mobile-*` (Recommendation ready, Giving recommendation).

Replaces: `PendingCouncilMessage` in `ChatMessage.tsx`, labels in `lib/statusLabels.ts`.

### Result

- Seats: `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); grid-auto-rows: 1fr; gap: 12px`. About 3 columns on desktop, 2 on tablet, 1 on mobile; every card in the grid has the same height. Card: `--sf`, `--bd2` border, radius 14, padding 14. Header: 24px mark tile (`--sf2`, persona colour, mono initials), name (600, 14px, ellipsis), verdict badge pushed right. Body: reasoning at 14/21. Citations sit at the bottom of the card, collapsed.
- Verdict badges: pill, 22px, dot plus label. Approve `--oks`/`--ok`, Request changes `--ers`/`--er`, Comment `--sf2`/`--mu`. Labels "Approve", "Request changes", "Comment" (v1 showed the raw value "request changes").
- Chair block: full width below the grid; the only amber surface (`--acs` fill, `--acb` border, radius 16, padding 18 20). Header: 18px mark, overline "Chair's recommendation" in `--act`, overall verdict badge (26px) on the right. Synthesis at 16/25, max 78ch. Divider, overline "Cited by the council", then one chip per distinct citation from all seats (GitHub or Linear mark, file name and line, or Linear title). A chip toggles a small excerpt block under the chips. Then the write-back area.
- Mobile: seats collapse to one-line rows (mark, name, verdict, chevron) that expand on tap; the chair verdict badge drops under the overline; citation chips scroll sideways on one line. The thread opens scrolled to the chair.
- 10 seats: the same grid handles more seats without change (scalability check only; v1 has three seats).

Mockups: `council-result-3-seats-desktop-dark.png`, `council-result-3-seats-desktop-light.png`, `council-result-3-seats-mobile-dark.png`, `council-result-3-seats-mobile-light.png`, `council-result-10-seats-desktop-dark.png`, `council-result-10-seats-mobile-dark.png`.

Replaces: `CouncilThreadBlock` in `ChatThread.tsx`; `PersonaHeader`, the persona and chair branches of `ChatMessage.tsx`; `VerdictBadge.tsx`; `CodeCitation.tsx`; `lib/personaMap.ts` colours.

## Write-back card

Lives inside the chair block, under the citations. The card itself is a neutral surface (`--sf`, `--bd2` border, radius 12, padding 14) so the chair stays the only amber surface.

| State | What shows |
|---|---|
| Propose | Primary small button "Propose write-back". |
| Proposing | Same button disabled, spinner, "Proposing write-back". |
| Plan shown | Header "Write-back plan" with "Nothing is created until you confirm." One row per plan line from `planActionLines()` ("Update docs/architecture/sessions.md" with a file icon, "Create Linear roadmap item" with the Linear mark). Field "Suggest a change" (placeholder "Optional refinement notes"). Actions: "Refine" (secondary, disabled until there is text) and "Confirm" (primary). |
| Refine | Feedback typed; "Refine" shows a spinner and "Refining"; Confirm disabled. |
| Plan refined | Same as Plan shown with the new lines (for example "Create new doc: session-store-cutover"). No "updated from your note", no draft number, no highlights. |
| Nothing to do | Empty plan: "No follow-up action needed. The recommendation doesn't call for a doc change or a roadmap item." Only Refine is offered (v1 hides Confirm). |
| Executing | Plan stays visible, feedback disabled, Confirm disabled with a spinner and "Creating". |
| Created | Header with a green check and "Written back". One row per execution result: GitHub or Linear mark and the API label as a link with an external icon (for example "didi-build/launchpad #142: Add session store cutover doc", "DIDI-731: Move sessions to D1 after the public beta"). |
| Failed, plan kept | Error callout at the top of the card: "Nothing was created. Something went wrong on our side, so it's safe to try again." (or the mapped sentence for 401, 403, 429). Plan and feedback stay. Primary button becomes "Retry". No partial-success list. |

Mockups: `write-back-propose-*`, `write-back-proposing-*`, `write-back-plan-shown-desktop-dark.png`, `write-back-plan-shown-desktop-light.png`, `write-back-plan-shown-mobile-*`, `write-back-refine-*`, `write-back-plan-refined-*`, `write-back-nothing-to-do-*`, `write-back-executing-*`, `write-back-created-desktop-dark.png`, `write-back-created-desktop-light.png`, `write-back-created-mobile-*`, `write-back-failed-plan-kept-*`.

Replaces: `WriteBackCard.tsx` and the chair footer in `ChatMessage.tsx`.

## Connections

Layout: top bar; page max 860px; sections with mono overlines.

- Banner (after an OAuth return): `--oks` fill, check, "GitHub connected. Add the repos Quorum should read." (or "Linear connected. Add the teams Quorum should read."), dismiss button.
- Accounts: two cards side by side (stacked on mobile). Connected: provider mark, name, green dot, "Connected as @didi-build" or "Connected to Didi Build", secondary "Add repos" or "Add teams" (opens the picker on that tab). Not connected: "Not connected", one line of explanation ("Install the Quorum app on the repos you want it to read." / "Let Quorum read your team's issues."), primary "Connect GitHub" or "Connect Linear" (same OAuth routes as v1).
- Knowledge sources header: overline, "N of M ready" in `--mu` (hidden on mobile) and primary "Add sources".
- Source list: one card with divided rows. Row: provider mark, name in Geist Mono, status line with a dot. Status copy: ready "Ready" (green dot); indexing "Indexing. Usually a few minutes." (pulsing amber ring); pending "Waiting to start" (amber ring); error "Can't read this source" (`--er`), followed by an `--ers` panel with the `status_message` text and actions "Check GitHub access" (external) and "Refresh". The list polls while anything is pending or indexing (v1 behaviour).
- Row actions: a "More" button opens "Refresh" (Read the latest changes) and "Remove" (Stop using it in answers). On desktop they sit in a small dropdown anchored to the button. On mobile they open inline under the row, inside the row's bounds (an `--sf2` panel with 44px items), and push the rows below down instead of covering them. While refreshing, the status line shows a spinner and "Refreshing".
- Remove with confirm: the row turns `--ers` and shows "Remove didi-build/we-met? Quorum stops answering from it. You can add it again any time." with "Keep" (quiet) and "Remove" (`--er` fill).
- Account menu: avatar opens a menu with a 36px avatar, "@diadem", "Signed in with GitHub", then "Connections" and "Sign out".
- Loading: three skeleton rows. Empty: dashed card "No knowledge sources yet" / "Connect GitHub or Linear above, then add the repos and teams Quorum should read." Load failed: the 5xx sentence and "Try again".

Mockups: `connections-connected-all-states-desktop-dark.png`, `connections-connected-all-states-desktop-light.png`, `connections-connected-all-states-mobile-dark.png`, `connections-connected-all-states-mobile-light.png`, `connections-nothing-connected-*`, `connections-loading-*`, `connections-row-menu-refreshing-*`, `connections-remove-confirm-*`, `connections-account-menu-*`, `connections-load-failed-*`.

Replaces: `ConnectionsView.tsx`, `SourceListItem.tsx`, `StatusChip.tsx` (status chip becomes the dot and status line), `SignOutButton.tsx` (moves into the account menu), source labels in `lib/statusLabels.ts`.

## Add source picker

New in this spec: v1 has the API (`GET` available sources returning `AvailableSourceItem`: `name`, `external_ref`, `private`, `key`, `already_added`) but no UI. Suggested component: `AddSourcePicker.tsx`, opened from Connections.

Layout: modal dialog, 600px wide, 72px from the top, radius 18, over a `--scrim`. On mobile it is a full-height sheet from 24px below the top with rounded top corners.

- Header: "Add knowledge sources" / "Choose what Quorum should read. You can remove a source any time." and a close button.
- Tabs: "GitHub repos" and "Linear teams", each with an amber count of selected rows when above zero.
- Search: "Search repos" or "Search teams", filters as you type.
- Caption: "Repos the Quorum app can access on @didi-build" or "Teams in Didi Build".
- Rows: checkbox, name in Geist Mono, sub line ("Private" with a lock, "Public", or the Linear team key). Selected rows get `--acs`. Rows with `already_added` are disabled, with a checked grey box and an "Added" chip.
- GitHub tab footer link: "Don't see a repo? Give Quorum access in GitHub" (external).
- Footer: "Cancel" (quiet) and primary "Add N sources" ("Add 1 source", disabled "Add sources" at zero).

States:

| State | What shows |
|---|---|
| GitHub repos | List as above with two rows selected. |
| Linear teams | Teams tab, "Didi Build" added, "Launchpad" selected. |
| Search, no match | "Nothing matches "billing"" / "Check the spelling, or give Quorum access to more repos in GitHub." Shown with nothing selected, so the confirm button is the disabled "Add sources". If rows were selected before searching, the selection is kept and the button keeps its count. |
| Loading | Search disabled, five skeleton rows. |
| Empty | "No repos to show" / "The Quorum app can't see any repos on @didi-build yet. Give it access to the ones you want, then come back." Access link stays. |
| Error | 5xx sentence and "Try again"; search disabled. |
| Not connected | GitHub mark, "Connect GitHub first" / "Install the Quorum app on your GitHub account, then pick the repos it should read here." and primary "Connect GitHub". No search. |
| Adding | Confirm button disabled with a spinner and "Adding". |
| Added | Dialog closes; toast "Added 2 sources. Indexing has started."; the new rows appear in the list as pending. |

Mockups: `add-source-github-repos-desktop-dark.png`, `add-source-github-repos-desktop-light.png`, `add-source-github-repos-mobile-dark.png`, `add-source-github-repos-mobile-light.png`, `add-source-linear-teams-*`, `add-source-search-no-match-*`, `add-source-loading-*`, `add-source-empty-*`, `add-source-error-*`, `add-source-not-connected-*`, `add-source-adding-*`, `add-source-added-*`.

## Decisions

- Variant A ("Redesign refined") was chosen over a calm editorial and a dense dev-tool direction.
- The chair's recommendation is a full-width block below the seats and the only amber surface in the product.
- Chair citations repeat the seats' citations (deduplicated) because v1 stores no citations on the chair (`CouncilDecision` has only `persona_opinions`, `overall_verdict`, `synthesis`).
- Seats use a responsive grid, `repeat(auto-fill, minmax(280px, 1fr))` with equal-height rows: about 3 columns on desktop, 2 on tablet, 1 on mobile. Checked with 10 seats.
- On mobile, seats are collapsed to one-line rows with the verdict and expand on tap, so the chair is never buried. The thread opens scrolled to the newest message.
- The write-back action reads "Propose write-back" (v1 wording).
- Verdicts read "Approve", "Request changes", "Comment" instead of the raw value.
- The optimistic "Understanding the message" shows alone; seat cards appear with the first supervisor status.
- The composer stays available with no sources (v1 still handles greetings); the empty state points to Connections.
- The connection strip replaces the source line when the socket is not open; closed or failed offers Refresh, since v1 never reconnects on its own.
- Linear stub replies get frontend copy instead of the API's internal sentence.
- The account menu replaces the separate sign-out button and the "@handle" caption.
- Source status uses a dot and a sentence instead of an uppercase chip.
- Dark is the default; light follows the system. No theme switch in the UI.
- Copy has no em dashes and no trailing ellipsis characters.

## Dropped from the redesign (1a to 1t) and why

| Item | Why |
|---|---|
| Per-seat live activity line ("Comparing refresh.ts with the provider's SDK") and one-line seat summary | Needs data v1 does not send (DIDI-446). |
| Stop button on a running council | No cancel API in v1 (DIDI-448). |
| Council timer ("0:18", "Council review 42s") | v1 sends no timing data. |
| Draft numbers ("DRAFT 2"), "Updated from your note", changed-line highlights | Not in `WriteBackProposalOut` (DIDI-448). |
| Partial-success list in a failed write-back, "Retry only redoes the rest" | v1 returns no partial results. |
| Item counts ("412 issues", "updated 2h ago") | Not in `KnowledgeSource` (DIDI-448). |
| Confirm button that states what will be created ("Create 1 PR and 2 issues") | Plan lines do not carry counts; the button stays "Confirm". |
| "Discard plan" | No discard endpoint in v1. |
| "Show plan" toggle on a created card | Kept the created card to the result links only. |
| Inline numbered footnotes in direct answers | v1 answer text has no citation markers; citations are listed under the answer. |
| Builder, Skeptic, Customer seats | v1 seats are UX, Dev experience and Business. |
| No composer until a source is ready | v1 answers greetings with no sources. |
| Reconnecting and offline states with automatic retry | v1 has no auto-reconnect (closed or failed shows Refresh). |
| Appearance switch and "Live updates" row in the account menu | v1 has no theme setting; connection state lives above the composer. |
| Bottom sheet for source actions on mobile | Actions open inline under the row instead, which keeps them next to the source and never covers other rows. |

## Changes

- 2026-10-23: Initial spec, DIDI-768 https://linear.app/didi-build/issue/DIDI-768
- 2026-10-23: Added the allowlist load failed state, the search no-match state now shows no selection, and mobile source row actions open inline under the row.
- 2026-10-23: Product renamed to Quorum
