# Data retention (Quorum)

This note summarizes automated retention for personal data stored in Quorum. The authoritative field-level map is `docs/privacy/data-map.yml`.

## Browser auth sessions (`sessions` table)

| Item             | Policy                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When access ends | Expired sessions (`expires_at` in the past) and revoked sessions (`revoked_at` set) are rejected on every authenticated HTTP request and on WebSocket handshake at auth time (in place). Sessions for GitHub ids removed from `AUTH_ALLOWED_GITHUB_IDS` are also rejected at auth time. Open chat WebSockets for a session are closed when that session is revoked (for example on `POST /auth/logout`). |
| Row retention    | Each row is kept until **30 days** after the earlier of `expires_at` and `revoked_at` (when `revoked_at` is null, only `expires_at` applies). Rows persist until the daily purge job deletes them (production cron not deployed yet).                                                                                                                                                                    |
| Purge mechanism  | Daily Worker cron (`purgeExpiredSessions` in `src/jobs/session-purge.ts`) deletes eligible rows in bounded batches. Only timestamps matching the expected ISO 8601 UTC shape are eligible.                                                                                                                                                                                                               |
| Timestamps       | Compared as ISO 8601 UTC strings in the `YYYY-MM-DDTHH:MM:SS.sssZ` shape.                                                                                                                                                                                                                                                                                                                                |

## API keys (`api_keys` table)

There is no in-app revocation for machine API keys yet. To rotate the bootstrap key: set a new `BOOTSTRAP_API_KEY`, deploy, then in D1 delete the `api_keys` row where `user_id IS NULL` and `key_hash` is the SHA-256 hash of the previous bootstrap secret so the old key cannot authenticate.

Account deletion and other stores follow `docs/runbooks/account-deletion.md` and per-column retention in the data map.
