# DIDI-888 mutation table (QA round 1)

Manual mutation check: apply the mutant locally, run the listed test file or case, confirm failure, then revert.

| Test                                                                     | Mutant                                                                                                                                                      | Killed |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `POST /auth/logout revokes the session row before chat WebSockets close` | Swap `src/routes/auth.ts` logout lines so `closeChatWebSocketsForSession` runs before `revokeBrowserSession` (spy call order becomes `close` then `revoke`) | yes    |
| `does not clear session cookie on plain unauthenticated 401`             | Set `clearSessionCookie: true` unconditionally in `src/index.ts` auth gate                                                                                  | yes    |
| `does not clear session cookie on bad API key 401`                       | Same as above                                                                                                                                               | yes    |
| `clears session cookie on 401 when GitHub id is no longer allowlisted`   | Remove `clearSessionCookie` branch (never clear on 401)                                                                                                     | yes    |
| `does not treat GET /chat/wsX as the chat WebSocket route`               | Route `/chat/wsX` through `handleChatWebSocket` (prefix match)                                                                                              | yes    |
| `flags a file at a reserved prefix root`                                 | Skip file-at-prefix branch in `frontend-dist-worker-route-guard.mjs`                                                                                        | yes    |
| `production frontend/dist has no files under /api, /council, or /chat`   | Drop a `frontend/dist/api/shadow` file                                                                                                                      | yes    |
