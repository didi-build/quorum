# Account deletion runbook

Use this runbook when a user requests account deletion or when you must remove personal data from production systems.

## 1. Preconditions

- Confirm the request is authorized and record the request ID and timestamp.
- Identify the account identifiers used across systems (user ID, email, session tokens).

## 2. Block sign-in and end sessions

- Disable authentication for the account.
- Revoke active sessions and API tokens tied to the account.

### Browser session rows (`sessions` table)

Expired and revoked browser sessions are rejected at auth time. For retention, a daily Worker cron deletes `sessions` rows when the earlier of `expires_at` and `revoked_at` (ISO 8601 UTC) is more than **30 days** in the past. See `docs/privacy/data-map.yml` (`sessions` table) and `docs/privacy/retention.md`.

## 3. Delete or anonymize by store

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
