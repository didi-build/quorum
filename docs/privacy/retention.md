# Data retention

This document summarizes how long Quorum keeps personal and operational data. The authoritative field-level map is `docs/privacy/data-map.yml`.

## Browser sessions

- Active sessions expire after the configured TTL (default 30 days, `SESSION_TTL_DAYS`).
- **Rejected at request time:** expired sessions (`expires_at` in the past) and revoked sessions (`revoked_at` set) do not authenticate HTTP or WebSocket traffic; the session row may still exist until purged.
- **Row purge:** D1 `sessions` rows are deleted 30 days after `expires_at` or `revoked_at` once the scheduled purge job from [DIDI-813](https://linear.app/didi-build/issue/DIDI-813) is deployed (see quorum#12). Until that job runs, rows remain in D1 after rejection.

## API keys

- Hashed API key rows remain until the key is revoked or the account deletion runbook removes them.

## Related runbooks

- `docs/runbooks/account-deletion.md`
