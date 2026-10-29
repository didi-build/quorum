# Account deletion runbook

Use this runbook when a user requests account deletion or when you must remove personal data from production systems.

## 1. Preconditions

- Confirm the request is authorized and record the request ID and timestamp.
- Identify the account identifiers used across systems (user ID, email, session tokens).

## 2. Block sign-in and end sessions

- Disable authentication for the account.
- Revoke active sessions and API tokens tied to the account.
- Removing a GitHub id from `AUTH_ALLOWED_GITHUB_IDS` blocks new sign-ins and rejects existing browser sessions on the next authenticated HTTP request after redeploy. It only affects new sockets; isolates that already hold an open chat WebSocket keep the previous environment until they drain. Always revoke that user's `sessions` rows in the database (set `revoked_at`) and delete or rotate that user's `api_keys` rows so open chat WebSockets and new handshakes fail on the next message after about 30 seconds (or immediately for new connections). Open chat WebSockets re-validate the database session or API key at most once every 30 seconds on incoming messages; only session revocation, session expiry, or API key row removal in the database closes those sockets with code 1008 on the next message after that interval. After revocation or key deletion, the socket may keep processing for up to about 30 seconds until the client sends; idle sockets stay open until send or disconnect. `POST /auth/logout` may close sockets on the same Worker isolate immediately as a fast path; it is not a guarantee across isolates.

### Browser session rows (`sessions` table)

Auth rejects expired and revoked browser sessions on every authenticated request at auth time (in place). For retention, a daily Worker cron deletes `sessions` rows when the earlier of `expires_at` and `revoked_at` (ISO 8601 UTC) is more than **30 days** in the past. Rows persist until that job runs (production cron not deployed yet). See `docs/privacy/data-map.yml` (`sessions` table) and `docs/privacy/retention.md`.

## 3. Delete or anonymize by store

Never delete a `users` row with raw SQL. Call the domain function `deleteUserAccount` in `src/domain/users/delete-account.ts` so Vectorize chunk vectors are removed before the D1 cascade runs. A production script that invokes `deleteUserAccount` is planned as follow-up work; this ticket does not add that script or an HTTP route.

Use `docs/privacy/data-map.yml` as the checklist of stores. For each row that holds this user's data, record what you did.

| Map location (table, item id, or binding) | Action taken | Verified by |
| ----------------------------------------- | ------------ | ----------- |
|                                           |              |             |

## 4. Stored objects and integrations

- Remove or anonymize objects in object storage, queues, and third-party integrations listed in the map.
- Cancel or complete async jobs that would recreate the user's data.

## 5. Tombstone and legal holds

- Note any fields or records you must retain (fraud prevention, billing, legal hold) and why.
- Document what was blanked versus deleted.

## 6. Verify

- Spot-check application UI, support tools, and logs for leftover identifiers.
- Run `nodrift check` after schema or binding changes related to deletion.

## 7. Related links

- `docs/privacy/data-map.yml`
- `docs/privacy/retention.md`
- `docs/privacy/subprocessors.yml`
- Vendor deletion or data-processing tickets (if any)

_This document is a starting skeleton, not legal advice. Review it with qualified counsel before relying on it._
