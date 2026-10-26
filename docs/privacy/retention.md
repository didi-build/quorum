# Data retention (Quorum)

This note summarizes automated retention for personal data stored in Quorum. The authoritative field-level map is `docs/privacy/data-map.yml`.

## Browser auth sessions (`sessions` table)

| Item             | Policy                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When access ends | Expired sessions (`expires_at` in the past) and revoked sessions (`revoked_at` set) must be rejected on every authenticated request; that requirement lands with DIDI-772 (not in place yet).                                         |
| Row retention    | Each row is kept until **30 days** after the earlier of `expires_at` and `revoked_at` (when `revoked_at` is null, only `expires_at` applies). Rows persist until the daily purge job deletes them (production cron not deployed yet). |
| Purge mechanism  | Daily Worker cron (`purgeExpiredSessions` in `src/jobs/session-purge.ts`) deletes eligible rows in bounded batches. Only timestamps matching the expected ISO 8601 UTC shape are eligible.                                            |
| Timestamps       | Compared as ISO 8601 UTC strings in the `YYYY-MM-DDTHH:MM:SS.sssZ` shape.                                                                                                                                                             |

Account deletion and other stores follow `docs/runbooks/account-deletion.md` and per-column retention in the data map.
