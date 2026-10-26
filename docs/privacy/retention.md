# Data retention (Quorum)

This note summarizes automated retention for personal data stored in Quorum. The authoritative field-level map is `docs/privacy/data-map.yml`.

## Browser auth sessions (`sessions` table)

| Item             | Policy                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| When access ends | Expired sessions (`expires_at` in the past) and revoked sessions (`revoked_at` set) must be rejected at authentication time.                  |
| Row retention    | Each row is kept until **30 days** after the earlier of `expires_at` and `revoked_at` (when `revoked_at` is null, only `expires_at` applies). |
| Purge mechanism  | Daily Worker cron (`purgeExpiredSessions` in `src/jobs/session-purge.ts`) deletes eligible rows in bounded batches.                           |
| Timestamps       | Compared as ISO 8601 UTC strings, consistent with `migrations/0001_initial_schema.sql`.                                                       |

Account deletion and other stores follow `docs/runbooks/account-deletion.md` and per-column retention in the data map.
